/**
 * Agent Runner - Core agent execution framework
 * 
 * Provides a complete agent execution loop with:
 * - Market data fetching
 * - AI decision making
 * - Trade execution
 * - Balance monitoring
 * - Error handling
 * - Lifecycle management
 * - Dynamic interval adjustment
 * - Action priority management
 */

import { ethers } from 'ethers';
import { X402LaunchClient } from '../client';
import {
  AgentConfig,
  AgentStatus,
  AgentState,
  AgentDecision,
  AgentExecutionResult,
  AgentLifecycleHooks,
  ActionTracker,
  DynamicIntervalConfig,
  ActionPriority,
  EXECUTION_PRESETS,
  ExecutionModePreset,
  AgentPosition,
} from './interfaces';
import { X402AIProvider } from './ai-provider';
import { OpenRouterProvider, createOpenRouterConfig } from './openrouter-provider';
import { DashboardClient } from './dashboard-client';
import { RobustProvider } from './rpc-provider';

export class AgentRunner {
  private client: X402LaunchClient;
  private config: AgentConfig;
  private aiProvider: X402AIProvider;
  private openRouterProvider?: OpenRouterProvider;
  private hooks: AgentLifecycleHooks;
  private dashboard?: DashboardClient;

  private status: AgentStatus;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private executionCount: number = 0;
  private state: AgentState;

  // Store chain config for balance queries
  private chainId: number;
  private rpcUrl: string;
  private wallet: ethers.Wallet;
  private ethersProvider: ethers.Provider;
  private robustProvider: RobustProvider;

  // USDC address by chain
  private static USDC_ADDRESSES: Record<number, string> = {
    84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
  };

  constructor(
    config: AgentConfig,
    privateKey: string,
    clientConfig?: {
      baseUrl?: string;
      chainId?: number;
      rpcUrl?: string;
    },
    hooks?: AgentLifecycleHooks
  ) {
    // Apply execution preset if specified
    this.config = this.applyExecutionPreset(config);
    this.hooks = hooks || {};

    // Initialize client
    this.chainId = clientConfig?.chainId || 84532;
    const baseUrl = clientConfig?.baseUrl || 'https://api.launch.x402agentpad.io';
    this.rpcUrl = clientConfig?.rpcUrl || 'https://sepolia.base.org';

    this.client = new X402LaunchClient({
      wallet: { privateKey },
      baseUrl,
      chainId: this.chainId,
      rpcUrl: this.rpcUrl,
    });

    // Initialize wallet and robust provider with retry logic
    this.wallet = new ethers.Wallet(privateKey);
    // Create robust provider with multiple RPC fallbacks
    this.robustProvider = new RobustProvider(this.rpcUrl, this.chainId, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    });
    this.ethersProvider = this.robustProvider.getProvider();
    const usdcAddress = AgentRunner.USDC_ADDRESSES[this.chainId] || AgentRunner.USDC_ADDRESSES[84532];

    // Initialize default AI provider (x402)
    this.aiProvider = new X402AIProvider(this.wallet, this.ethersProvider, this.chainId, usdcAddress);

    // Initialize OpenRouter provider if configured
    if (this.config.modelProvider === 'openrouter' || this.config.openRouterConfig) {
      const openRouterConfig = this.config.openRouterConfig || createOpenRouterConfig('balanced');
      this.openRouterProvider = new OpenRouterProvider(
        openRouterConfig,
        this.wallet,
        this.ethersProvider,
        this.chainId,
        usdcAddress
      );
      console.log(`🤖 OpenRouter initialized with ${openRouterConfig.models.length} models`);
    }

    // Initialize state with new tracking fields
    this.state = {
      config: this.config,
      balance: '0',
      positions: [],
      executionHistory: [],
      launchedTokens: [],
      // Dynamic interval state
      currentIntervalMode: 'base',
      fastModeExpiresAt: undefined,
      // Action tracking
      actionTrackers: this.initializeActionTrackers(),
      // Performance metrics
      totalProfitLoss: '0',
      winCount: 0,
      lossCount: 0,
      totalModelCost: '0',
      totalGasUsed: '0',
    };

    // Initialize status with new fields
    this.status = {
      agentId: this.config.agentId,
      status: 'stopped',
      isRunning: false,
      executionCount: 0,
      currentIntervalMode: 'base',
      currentIntervalMs: this.config.reviewIntervalMs,
      totalProfitLoss: '0',
      winRate: 0,
      openPositions: 0,
    };

    // Initialize dashboard client (if URL provided)
    if (this.config.dashboardUrl) {
      this.dashboard = new DashboardClient(this.config.dashboardUrl, this.config.agentId);
    }

    // Log configuration
    this.logConfiguration();
  }

  /**
   * Apply execution preset to config
   */
  private applyExecutionPreset(config: AgentConfig): AgentConfig {
    if (!config.executionPreset || config.executionPreset === 'custom') {
      return config;
    }

    const preset = EXECUTION_PRESETS[config.executionPreset];
    if (!preset) {
      console.warn(`Unknown execution preset: ${config.executionPreset}, using config as-is`);
      return config;
    }

    console.log(`\n🎯 Applying execution preset: ${config.executionPreset.toUpperCase()}`);

    // Merge preset with user config (user config takes precedence)
    return {
      ...config,
      reviewIntervalMs: config.reviewIntervalMs || preset.reviewIntervalMs || 120000,
      dynamicInterval: config.dynamicInterval || preset.dynamicInterval,
      actionPriorities: config.actionPriorities || preset.actionPriorities,
    };
  }

  /**
   * Initialize action trackers for rate limiting
   */
  private initializeActionTrackers(): ActionTracker[] {
    const actions = ['buy', 'sell', 'launch', 'analyze', 'discover', 'wait'];
    return actions.map(action => ({
      action,
      lastExecutedAt: 0,
      executionsThisHour: 0,
      hourStartedAt: Date.now(),
    }));
  }

  /**
   * Log configuration summary
   */
  private logConfiguration(): void {
    console.log(`\n📋 Agent Configuration:`);
    console.log(`   Agent ID: ${this.config.agentId}`);
    console.log(`   Execution Preset: ${this.config.executionPreset || 'custom'}`);
    console.log(`   Base Interval: ${this.config.reviewIntervalMs / 1000}s`);
    
    if (this.config.dynamicInterval) {
      console.log(`   Dynamic Intervals:`);
      console.log(`     - Fast: ${this.config.dynamicInterval.fastIntervalMs / 1000}s`);
      console.log(`     - Base: ${this.config.dynamicInterval.baseIntervalMs / 1000}s`);
      console.log(`     - Slow: ${this.config.dynamicInterval.slowIntervalMs / 1000}s`);
      console.log(`   Fast Triggers: ${this.config.dynamicInterval.triggerFastOn.join(', ')}`);
      console.log(`   Slow Triggers: ${this.config.dynamicInterval.triggerSlowOn.join(', ')}`);
    }

    if (this.config.actionPriorities) {
      console.log(`   Action Priorities:`);
      const sorted = [...this.config.actionPriorities].sort((a, b) => a.priority - b.priority);
      sorted.forEach(ap => {
        const enabled = ap.enabled !== false ? '✓' : '✗';
        const limit = ap.maxPerHour ? `(max ${ap.maxPerHour}/hr)` : '';
        console.log(`     ${enabled} P${ap.priority}: ${ap.action} ${limit}`);
      });
    }
  }

  /**
   * Start the agent execution loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.status.status = 'running';
    this.status.isRunning = true;
    this.status.startedAt = Date.now();

    // Determine execution mode
    await this.determineExecutionMode();

    // Call onStart hook
    if (this.hooks.onStart || this.config.onStart) {
      try {
        await this.hooks.onStart?.();
        await this.config.onStart?.();
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} onStart hook error:`, error);
      }
    }

    // Notify dashboard
    if (this.dashboard) {
      await this.dashboard.notifyStart();
    }

    // Run execution loop
    await this.executionLoop();
  }

  /**
   * Determine and set execution mode based on config and ETH balance
   */
  private async determineExecutionMode(): Promise<void> {
    const mode = this.config.executionMode || 'auto';

    if (mode === 'auto') {
      // Auto-detect based on ETH balance
      const hasEth = await this.client.hasEnoughEthForSelfExecute();
      const selectedMode = hasEth ? 'self-execute' : 'gasless';
      this.client.setExecutionMode(selectedMode);

      const ethBalance = await this.client.getEthBalance();
      const ethBalanceFormatted = (Number(ethBalance) / 1e18).toFixed(4);

      console.log(`\n💰 Execution Mode: ${selectedMode.toUpperCase()}`);
      console.log(`   ETH Balance: ${ethBalanceFormatted} ETH`);
      if (selectedMode === 'gasless') {
        console.log(`   💸 Using Gasless (Premium): No ETH required, 2 USDC per trade`);
      } else {
        console.log(`   ⚡ Using Self-Execute (Economy): Agent pays gas, 0.5 USDC per trade`);
      }
    } else {
      // Use explicit mode from config
      this.client.setExecutionMode(mode);
      console.log(`\n💰 Execution Mode: ${mode.toUpperCase()} (explicit)`);
      if (mode === 'gasless') {
        console.log(`   💸 Gasless (Premium): No ETH required, 2 USDC per trade`);
      } else {
        console.log(`   ⚡ Self-Execute (Economy): Agent pays gas, 0.5 USDC per trade`);
      }
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.status.status = 'stopped';
    this.status.isRunning = false;
    this.status.stoppedAt = Date.now();

    // Call onStop hook
    if (this.hooks.onStop || this.config.onStop) {
      try {
        await this.hooks.onStop?.();
        await this.config.onStop?.();
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} onStop hook error:`, error);
      }
    }

    // Notify dashboard
    if (this.dashboard) {
      await this.dashboard.notifyStop();
    }
  }

  /**
   * Pause the agent
   */
  async pause(): Promise<void> {
    this.isPaused = true;
    this.status.status = 'paused';

    // Call onPause hook
    if (this.hooks.onPause) {
      try {
        await this.hooks.onPause();
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} onPause hook error:`, error);
      }
    }
  }

  /**
   * Resume the agent
   */
  async resume(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Agent is not running. Use start() instead.');
    }

    this.isPaused = false;
    this.status.status = 'running';

    // Call onResume hook
    if (this.hooks.onResume) {
      try {
        await this.hooks.onResume();
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} onResume hook error:`, error);
      }
    }
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return { ...this.status };
  }

  /**
   * Get agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Main execution loop with dynamic interval support
   */
  private async executionLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if paused
        if (this.isPaused) {
          await this.sleep(1000);
          continue;
        }

        // Check working hours
        if (!this.isWithinWorkingHours()) {
          // Trigger slow mode when outside working hours
          this.triggerSlowMode('outside_hours');
          await this.sleep(60000); // Check every minute
          continue;
        }

        // Execute one cycle
        const cycleStartTime = Date.now();
        const result = await this.executeOneCycle();
        const executionTimeMs = Date.now() - cycleStartTime;

        // Add execution time to result
        result.executionTimeMs = executionTimeMs;
        result.intervalMode = this.state.currentIntervalMode;

        // Update status
        this.status.lastExecution = result;
        this.status.executionCount = ++this.executionCount;
        this.state.executionHistory.push(result);

        // Update action tracker
        this.updateActionTracker(result.action);

        // Update performance metrics
        this.updatePerformanceMetrics(result);

        // Determine next interval based on result
        this.adjustIntervalBasedOnResult(result);

        // Call onExecution hook
        if (this.hooks.onExecution || this.config.onExecution) {
          try {
            await this.hooks.onExecution?.(result);
            await this.config.onExecution?.(result);
          } catch (error: any) {
            console.error(`Agent ${this.config.agentId} onExecution hook error:`, error);
          }
        }

        // Notify dashboard
        if (this.dashboard) {
          await this.dashboard.notifyExecution(result);
        }

        // Get dynamic interval
        const nextInterval = this.getCurrentInterval();
        this.status.currentIntervalMs = nextInterval;
        this.status.nextExecutionAt = Date.now() + nextInterval;

        console.log(`⏱️  Next execution in ${(nextInterval / 1000).toFixed(1)}s (${this.state.currentIntervalMode} mode)`);

        // Wait for next interval
        await this.sleep(nextInterval);

      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} execution error:`, error);

        this.status.lastError = error;
        this.status.status = 'error';

        // CREATE ERROR EXECUTION RECORD so it shows in frontend
        const errorResult = {
          success: false,
          action: 'wait' as const, // Use 'wait' as the action type for errors
          decision: {
            action: 'wait' as const,
            params: { reason: `ERROR: ${error.message}` },
            reasoning: `Execution failed: ${error.message}`,
            confidence: 0,
          },
          error: error.message,
          timestamp: Date.now(),
          balanceBefore: this.state.balance || '0',
          balanceAfter: this.state.balance || '0',
        };

        // Call onExecution with error result so it appears in logs
        if (this.hooks.onExecution || this.config.onExecution) {
          try {
            await this.hooks.onExecution?.(errorResult);
            await this.config.onExecution?.(errorResult);
          } catch (hookError: any) {
            console.error(`Agent ${this.config.agentId} error execution logging failed:`, hookError);
          }
        }

        // Call onError hook
        if (this.hooks.onError || this.config.onError) {
          try {
            await this.hooks.onError?.(error);
            await this.config.onError?.(error);
          } catch (hookError: any) {
            console.error(`Agent ${this.config.agentId} onError hook error:`, hookError);
          }
        }

        // Wait before retrying
        await this.sleep(10000);
        this.status.status = 'running';
      }
    }
  }

  /**
   * Get current interval based on dynamic interval config and state
   */
  private getCurrentInterval(): number {
    const dynamicConfig = this.config.dynamicInterval;
    
    if (!dynamicConfig) {
      // Use legacy fixed interval
      return this.config.reviewIntervalMs;
    }

    // Check if fast mode has expired
    if (this.state.fastModeExpiresAt && Date.now() > this.state.fastModeExpiresAt) {
      this.state.currentIntervalMode = 'base';
      this.state.fastModeExpiresAt = undefined;
    }

    // Return interval based on current mode
    switch (this.state.currentIntervalMode) {
      case 'fast':
        return dynamicConfig.fastIntervalMs;
      case 'slow':
        return dynamicConfig.slowIntervalMs;
      case 'base':
      default:
        return dynamicConfig.baseIntervalMs;
    }
  }

  /**
   * Adjust interval based on execution result
   */
  private adjustIntervalBasedOnResult(result: AgentExecutionResult): void {
    const dynamicConfig = this.config.dynamicInterval;
    if (!dynamicConfig) return;

    // LAUNCH triggers fast mode - agent should buy immediately after launching
    if (result.success && result.action === 'launch') {
      console.log(`🚀 Launch successful - triggering FAST mode for immediate follow-up action`);
      this.triggerFastMode('token_launched');
    }

    // Check for fast mode triggers
    if (result.success && ['buy', 'sell'].includes(result.action)) {
      if (dynamicConfig.triggerFastOn.includes('trade_executed')) {
        this.triggerFastMode('trade_executed');
      }
    }

    if (result.action === 'buy' || result.action === 'sell') {
      if (dynamicConfig.triggerFastOn.includes('position_change')) {
        this.triggerFastMode('position_change');
      }
    }

    // Check for slow mode triggers
    if (this.state.positions.length > 0) {
      if (dynamicConfig.triggerSlowOn.includes('holding_positions')) {
        // Only switch to slow if not in fast mode
        if (this.state.currentIntervalMode !== 'fast') {
          this.triggerSlowMode('holding_positions');
        }
      }
    }

    // Low balance trigger
    const minBalance = BigInt(this.config.minBalanceUSDC || '500000');
    const currentBalance = BigInt(this.state.balance || '0');
    if (currentBalance < minBalance * BigInt(2)) {
      if (dynamicConfig.triggerSlowOn.includes('low_balance')) {
        this.triggerSlowMode('low_balance');
      }
    }
  }

  /**
   * Trigger fast mode
   */
  private triggerFastMode(reason: string): void {
    const dynamicConfig = this.config.dynamicInterval;
    if (!dynamicConfig) return;

    const duration = dynamicConfig.fastModeDurationMs || 300000; // Default 5 min
    
    this.state.currentIntervalMode = 'fast';
    this.state.fastModeExpiresAt = Date.now() + duration;
    this.status.currentIntervalMode = 'fast';

    console.log(`🚀 Fast mode activated (${reason}) for ${duration / 1000}s`);
  }

  /**
   * Trigger slow mode
   */
  private triggerSlowMode(reason: string): void {
    // Don't override fast mode
    if (this.state.currentIntervalMode === 'fast') return;

    this.state.currentIntervalMode = 'slow';
    this.status.currentIntervalMode = 'slow';

    console.log(`🐢 Slow mode activated (${reason})`);
  }

  /**
   * Update action tracker for rate limiting
   */
  private updateActionTracker(action: string): void {
    const tracker = this.state.actionTrackers.find(t => t.action === action);
    if (!tracker) return;

    const now = Date.now();
    
    // Reset hourly counter if hour has passed
    if (now - tracker.hourStartedAt > 3600000) {
      tracker.executionsThisHour = 0;
      tracker.hourStartedAt = now;
    }

    tracker.lastExecutedAt = now;
    tracker.executionsThisHour++;
  }

  /**
   * Check if action is allowed based on cooldown and rate limits
   */
  private isActionAllowed(action: string): { allowed: boolean; reason?: string } {
    const priorities = this.config.actionPriorities;
    if (!priorities) return { allowed: true };

    const priority = priorities.find(p => p.action === action);
    if (!priority) return { allowed: true };

    // Check if action is disabled
    if (priority.enabled === false) {
      return { allowed: false, reason: 'Action is disabled' };
    }

    const tracker = this.state.actionTrackers.find(t => t.action === action);
    if (!tracker) return { allowed: true };

    const now = Date.now();

    // Check cooldown
    if (priority.cooldownMs) {
      const timeSinceLast = now - tracker.lastExecutedAt;
      if (timeSinceLast < priority.cooldownMs) {
        return {
          allowed: false,
          reason: `Cooldown: ${((priority.cooldownMs - timeSinceLast) / 1000).toFixed(0)}s remaining`,
        };
      }
    }

    // Check hourly limit
    if (priority.maxPerHour !== undefined) {
      // Reset counter if hour has passed
      if (now - tracker.hourStartedAt > 3600000) {
        tracker.executionsThisHour = 0;
        tracker.hourStartedAt = now;
      }

      if (tracker.executionsThisHour >= priority.maxPerHour) {
        return {
          allowed: false,
          reason: `Hourly limit reached (${priority.maxPerHour}/hr)`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Update performance metrics after execution
   */
  private updatePerformanceMetrics(result: AgentExecutionResult): void {
    // Calculate P/L if we have before/after balances
    if (result.balanceBefore && result.balanceAfter) {
      const before = BigInt(result.balanceBefore);
      const after = BigInt(result.balanceAfter);
      const pl = after - before;
      
      result.profitLoss = pl.toString();
      
      // Update total P/L
      const totalPL = BigInt(this.state.totalProfitLoss) + pl;
      this.state.totalProfitLoss = totalPL.toString();
      this.status.totalProfitLoss = totalPL.toString();

      // Update win/loss count for trades
      if (['buy', 'sell'].includes(result.action) && result.success) {
        if (pl > BigInt(0)) {
          this.state.winCount++;
        } else if (pl < BigInt(0)) {
          this.state.lossCount++;
        }

        // Calculate win rate
        const totalTrades = this.state.winCount + this.state.lossCount;
        if (totalTrades > 0) {
          this.status.winRate = Math.round((this.state.winCount / totalTrades) * 100);
        }
      }
    }

    // Update open positions count
    this.status.openPositions = this.state.positions.length;
  }

  /**
   * Execute one agent cycle
   */
  private async executeOneCycle(): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // Get balance
    const balanceBefore = await this.getBalance();
    this.state.balance = balanceBefore;

    // Check minimum balance
    const minBalance = this.config.minBalanceUSDC || '10000'; // 0.01 USDC default
    if (BigInt(balanceBefore) < BigInt(minBalance)) {
      // Call low balance hook
      if (this.hooks.onLowBalance) {
        try {
          await this.hooks.onLowBalance(balanceBefore);
        } catch (error: any) {
          console.error(`Agent ${this.config.agentId} onLowBalance hook error:`, error);
        }
      }

      return {
        success: false,
        action: 'wait',
        decision: {
          action: 'wait',
          params: { reason: 'Low balance' },
          reasoning: `Balance ${balanceBefore} is below minimum ${minBalance}`,
        },
        error: 'Low balance',
        timestamp: startTime,
        balanceBefore,
      };
    }

    // Get market data
    const marketData = await this.getMarketData();

    // Add current positions to market data for prompt
    const marketDataWithPositions = {
      ...marketData,
      currentPositions: this.state.positions.map((p: any) => ({
        tokenAddress: p.tokenAddress,
        tokenAmount: p.tokenAmount,
        usdcInvested: p.usdcInvested,
        entryTime: p.entryTime,
        entryPrice: p.entryPrice,
        holdTimeMs: Date.now() - (p.entryTime || Date.now()),
      })),
    };

    // Check which actions are on cooldown
    const actionCooldowns: { [action: string]: string } = {};
    const actions = ['launch', 'buy', 'sell', 'discover', 'analyze'];
    for (const action of actions) {
      const check = this.isActionAllowed(action);
      if (!check.allowed) {
        actionCooldowns[action] = check.reason || 'On cooldown';
      }
    }

    // Build prompt and get AI decision (include launched tokens and cooldowns)
    const prompt = this.aiProvider.buildPrompt(
      this.config,
      marketDataWithPositions,
      balanceBefore,
      this.state.launchedTokens || [],
      actionCooldowns
    );

    // Track model call time
    const modelStartTime = Date.now();

    // Use OpenRouter if configured, otherwise use default x402 AI provider
    let modelResponse: string;
    if (this.openRouterProvider && (this.config.modelProvider === 'openrouter' || this.config.openRouterConfig)) {
      modelResponse = await this.openRouterProvider.callModel(prompt, this.config);
    } else {
      modelResponse = await this.aiProvider.callModel(prompt, this.config);
    }

    const modelLatencyMs = Date.now() - modelStartTime;
    
    const decision = this.aiProvider.parseDecision(modelResponse);
    
    // Add model latency to decision for tracking
    (decision as any).modelLatencyMs = modelLatencyMs;

    // Call onDecision hook
    if (this.hooks.onDecision) {
      try {
        await this.hooks.onDecision(decision);
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} onDecision hook error:`, error);
      }
    }

    // Execute decision
    const executionResult = await this.executeDecision(decision);

    // Get balance after
    const balanceAfter = await this.getBalance();

    return {
      success: executionResult.success,
      action: decision.action,
      decision,
      marketData,
      executionResult,
      error: executionResult.error,
      timestamp: startTime,
      balanceBefore,
      balanceAfter,
      modelLatencyMs,
    };
  }

  /**
   * Get market data using SDK
   */
  private async getMarketData(): Promise<{ tokens: any[] }> {
    try {
      const { tokens } = await this.client.discoverTokens({
        page: 1,
        limit: 10,
        sortBy: 'launchTime', // Sort by launch time so newly launched tokens appear first
        sortOrder: 'desc',
      });
      return { tokens };
    } catch (error: any) {
      console.warn(`Failed to get market data: ${error.message}`);
      return { tokens: [] };
    }
  }

  /**
   * Execute agent decision
   */
  private async executeDecision(decision: AgentDecision): Promise<any> {
    try {
      switch (decision.action) {
        case 'buy': {
          if (!decision.params?.tokenAddress || !decision.params?.usdcAmount) {
            return { success: false, error: 'Missing buy parameters' };
          }

          const tokenAddress = decision.params.tokenAddress.toLowerCase();

          // Allow multiple positions in the same token (accumulation strategy)
          // Just check total position limit

          // Check position limit
          if (this.state.positions.length >= (this.config.maxPositions || 5)) {
            return {
              success: false,
              error: `Maximum positions reached (${this.config.maxPositions}). Sell existing positions first.`,
            };
          }

          // Convert usdcAmount from decimal USDC to atomic units (6 decimals)
          // Tool accepts decimal format: "0.5", "5.0", "10.25"
          let usdcAmountStr = String(decision.params.usdcAmount);
          const decimalAmount = parseFloat(usdcAmountStr);

          if (isNaN(decimalAmount) || decimalAmount < 0) {
            return { success: false, error: `Invalid usdcAmount format: ${usdcAmountStr}` };
          }

          // Convert to atomic units (6 decimals)
          usdcAmountStr = Math.floor(decimalAmount * 1e6).toString();
          
          // ENFORCE max position size from config (cap the buy amount)
          const maxPositionSize = BigInt(this.config.maxPositionSizeUSDC);
          let buyAmount = BigInt(usdcAmountStr);
          
          if (buyAmount > maxPositionSize) {
            console.log(`[AgentRunner] ⚠️ AI requested ${Number(buyAmount)/1e6} USDC but max is ${Number(maxPositionSize)/1e6} USDC - capping`);
            buyAmount = maxPositionSize;
            usdcAmountStr = maxPositionSize.toString();
          }
          
          console.log(`[AgentRunner] Buying with ${Number(buyAmount)/1e6} USDC (${usdcAmountStr} atomic units)`);

          // Validate buy amount doesn't exceed balance
          const balance = BigInt(this.state.balance);
          if (buyAmount > balance) {
            return {
              success: false,
              error: `Insufficient balance: trying to buy ${buyAmount} but only have ${balance}`,
            };
          }

          // Execute buy based on execution mode
          const executionMode = this.client.getExecutionMode();
          let buyResult: any;

          if (executionMode === 'gasless') {
            // Backend executes transaction (Premium)
            buyResult = await this.client.buyTokens({
              tokenAddress: decision.params.tokenAddress,
              usdcAmount: usdcAmountStr,
            });
          } else {
            // Self-execute (Economy)
            const signedData = await this.client.buyTokensSelfExecute({
              tokenAddress: decision.params.tokenAddress,
              usdcAmount: usdcAmountStr,
            });

            // Execute transaction and wait for confirmation
            const txHash = await this.client.executeBuyTransaction(signedData);

            // Construct result similar to gasless mode
            buyResult = {
              transactionHash: txHash,
              buyer: this.client.getWalletAddress(),
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: '0', // Will be updated by balance check
              usdcPaid: usdcAmountStr,
              averagePricePerToken: '0',
              bondingCurveStatus: {
                tokensSold: '0',
                totalUSDCRaised: '0',
                currentPrice: '0',
                progress: 0,
              },
            };
          }

          // Track position with full interface
          const newPosition: AgentPosition = {
            tokenAddress: decision.params.tokenAddress,
            tokenAmount: buyResult.tokenAmount,
            usdcInvested: buyResult.usdcPaid,
            entryPrice: buyResult.averagePricePerToken,
            entryTime: Date.now(),
            currentPrice: buyResult.averagePricePerToken,
            unrealizedPL: '0',
            status: 'open',
          };
          this.state.positions.push(newPosition);

          return { success: true, ...buyResult };
        }

        case 'sell': {
          if (!decision.params?.tokenAddress || !decision.params?.tokenAmount) {
            return { success: false, error: 'Missing sell parameters' };
          }

          const sellTokenAddress = decision.params.tokenAddress.toLowerCase();

          // Convert tokenAmount from decimal tokens to atomic units (18 decimals)
          // Tool accepts decimal format: "0.5", "1.0", "10.25"
          let tokenAmountStr = String(decision.params.tokenAmount);
          const decimalTokenAmount = parseFloat(tokenAmountStr);

          if (isNaN(decimalTokenAmount) || decimalTokenAmount < 0) {
            return { success: false, error: `Invalid tokenAmount format: ${tokenAmountStr}` };
          }

          // Convert to atomic units (18 decimals for tokens)
          tokenAmountStr = Math.floor(decimalTokenAmount * 1e18).toString();
          console.log(`[AgentRunner] Selling ${decision.params.tokenAmount} tokens (${tokenAmountStr} atomic units)`);

          // Execute sell based on execution mode
          const sellExecutionMode = this.client.getExecutionMode();
          let sellResult: any;

          if (sellExecutionMode === 'gasless') {
            // Backend executes transaction (Premium)
            sellResult = await this.client.sellTokens({
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
            });
          } else {
            // Self-execute (Economy)
            const signedData = await this.client.sellTokensSelfExecute({
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
            });

            // Execute transaction and wait for confirmation
            const txHash = await this.client.executeSellTransaction(signedData);

            // Construct result similar to gasless mode
            sellResult = {
              transactionHash: txHash,
              seller: this.client.getWalletAddress(),
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
              usdcReceived: '0', // Will be updated by balance check
              averagePricePerToken: '0',
              bondingCurveStatus: {
                tokensSold: '0',
                totalUSDCRaised: '0',
                currentPrice: '0',
                progress: 0,
              },
            };
          }

          // Update positions: Remove one position for this token (FIFO)
          // If agent has multiple positions in same token, remove the oldest one
          const positionIndex = this.state.positions.findIndex(
            (p: any) => p.tokenAddress?.toLowerCase() === sellTokenAddress
          );
          if (positionIndex !== -1) {
            this.state.positions.splice(positionIndex, 1);
          }

          return { success: true, ...sellResult };
        }

        case 'launch': {
          // Accept both 'ticker' and 'symbol' (AI sometimes uses 'symbol')
          const ticker = decision.params?.ticker || decision.params?.symbol;
          if (!decision.params?.name || !ticker || !decision.params?.description) {
            return { success: false, error: `Missing launch parameters. Got: name=${decision.params?.name}, ticker=${ticker}, description=${decision.params?.description?.substring(0, 20)}` };
          }
          const launchResult = await this.client.launchToken({
            name: decision.params.name,
            ticker: ticker.toUpperCase(),
            description: decision.params.description,
            image: decision.params.image || `https://via.placeholder.com/400/000000/FFFFFF?text=${encodeURIComponent(decision.params.ticker)}`,
            initialSupply: decision.params.initialSupply,
          });

          // Track launched token
          if (launchResult.tokenAddress && this.state.launchedTokens) {
            this.state.launchedTokens.push(launchResult.tokenAddress.toLowerCase());
            // Keep only last 10 launched tokens
            if (this.state.launchedTokens.length > 10) {
              this.state.launchedTokens.shift();
            }
          }

          return { success: true, ...launchResult };
        }

        case 'analyze': {
          if (!decision.params?.tokenAddress) {
            return { success: false, error: 'Missing token address' };
          }
          const tokenInfo = await this.client.getTokenInfo(decision.params.tokenAddress);
          return { success: true, tokenInfo };
        }

        case 'discover':
        case 'wait':
        default:
          return { success: true, action: decision.action, message: 'No action taken' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get agent wallet balance (on-chain) with retry logic
   */
  private async getBalance(): Promise<string> {
    try {
      const walletAddress = this.client.getWalletAddress();
      const usdcAddress = AgentRunner.USDC_ADDRESSES[this.chainId] || AgentRunner.USDC_ADDRESSES[84532];

      // Query USDC balance using robust provider with retry
      const usdcABI = [
        'function balanceOf(address account) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];
      
      const balance = await this.robustProvider.call(async (provider) => {
        const usdcContract = new ethers.Contract(usdcAddress, usdcABI, provider);
        return await usdcContract.balanceOf(walletAddress);
      }, 'getBalance');

      // Update state with actual balance
      const balanceString = balance.toString();
      this.state.balance = balanceString;
      this.status.balance = balanceString;

      return balanceString;
    } catch (error: any) {
      console.warn(`Failed to get balance after retries: ${error.message}`);
      return this.state.balance || '0';
    }
  }

  /**
   * Set balance (called by execution service)
   */
  setBalance(balance: string): void {
    this.state.balance = balance;
    this.status.balance = balance;
  }

  /**
   * Sell all positions (manual cleanup)
   * Returns array of sell results for each position
   */
  async sellAllPositions(): Promise<Array<{ tokenAddress: string; success: boolean; txHash?: string; error?: string }>> {
    const results: Array<{ tokenAddress: string; success: boolean; txHash?: string; error?: string }> = [];
    
    // Make a copy since we'll be modifying the array
    const positions = [...this.state.positions];
    
    console.log(`[AgentRunner] Selling all ${positions.length} positions...`);
    
    for (const position of positions) {
      try {
        const tokenAddress = position.tokenAddress;
        const tokenAmount = position.tokenAmount;
        
        console.log(`[AgentRunner] Selling ${tokenAmount} of ${tokenAddress.slice(0, 10)}...`);
        
        // Execute sell based on execution mode
        const executionMode = this.client.getExecutionMode();
        let sellResult: any;

        if (executionMode === 'gasless') {
          sellResult = await this.client.sellTokens({
            tokenAddress,
            tokenAmount,
          });
        } else {
          const signedData = await this.client.sellTokensSelfExecute({
            tokenAddress,
            tokenAmount,
          });
          const txHash = await this.client.executeSellTransaction(signedData);
          sellResult = { transactionHash: txHash };
        }

        // Remove from positions
        const positionIndex = this.state.positions.findIndex(
          (p: any) => p.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
        );
        if (positionIndex !== -1) {
          this.state.positions.splice(positionIndex, 1);
        }

        results.push({
          tokenAddress,
          success: true,
          txHash: sellResult.transactionHash,
        });
        
        console.log(`[AgentRunner] ✅ Sold ${tokenAddress.slice(0, 10)} - TX: ${sellResult.transactionHash}`);
        
      } catch (error: any) {
        console.error(`[AgentRunner] ❌ Failed to sell ${position.tokenAddress}:`, error.message);
        results.push({
          tokenAddress: position.tokenAddress,
          success: false,
          error: error.message,
        });
      }
    }
    
    // Update open positions count
    this.status.openPositions = this.state.positions.length;
    
    console.log(`[AgentRunner] Sell all complete. ${results.filter(r => r.success).length}/${positions.length} sold successfully.`);
    
    return results;
  }

  /**
   * Get current positions
   */
  getPositions(): any[] {
    return this.state.positions;
  }

  /**
   * Check if within working hours
   */
  private isWithinWorkingHours(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const start = this.config.workingHoursStart || 0;
    const end = this.config.workingHoursEnd || 23;

    return currentHour >= start && currentHour <= end;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

