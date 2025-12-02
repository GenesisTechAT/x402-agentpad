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
 */

import { ethers } from "ethers";
import { X402LaunchClient } from "../client";
import {
  AgentConfig,
  AgentStatus,
  AgentState,
  AgentDecision,
  AgentExecutionResult,
  AgentLifecycleHooks,
  AgentPosition,
} from "./interfaces";
import { X402AIProvider } from "./ai-provider";
import {
  OpenRouterProvider,
  createOpenRouterConfig,
} from "./openrouter-provider";
import { DashboardClient } from "./dashboard-client";
import { RobustProvider } from "./rpc-provider";

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
  private currentPhase: import('./interfaces').ExecutionPhase = 'idle';

  // Store chain config for balance queries
  private chainId: number;
  private rpcUrl: string;
  private wallet: ethers.Wallet;
  private ethersProvider: ethers.Provider;
  private robustProvider: RobustProvider;

  // USDC address by chain
  private static USDC_ADDRESSES: Record<number, string> = {
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
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
    this.config = config;
    this.hooks = hooks || {};

    // Initialize client
    this.chainId = clientConfig?.chainId || 84532;
    const baseUrl =
      clientConfig?.baseUrl || "https://api.launch.x402agentpad.io";
    this.rpcUrl = clientConfig?.rpcUrl || "https://sepolia.base.org";

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
    const usdcAddress =
      AgentRunner.USDC_ADDRESSES[this.chainId] ||
      AgentRunner.USDC_ADDRESSES[84532];

    // Initialize default AI provider (x402)
    this.aiProvider = new X402AIProvider(
      this.wallet,
      this.ethersProvider,
      this.chainId,
      usdcAddress
    );

    // Initialize OpenRouter provider if explicitly configured
    if (this.config.modelProvider === "openrouter") {
      const openRouterConfig =
        this.config.openRouterConfig || createOpenRouterConfig("balanced");
      this.openRouterProvider = new OpenRouterProvider(
        openRouterConfig,
        this.wallet,
        this.ethersProvider,
        this.chainId,
        usdcAddress
      );
      console.log(
        `🤖 OpenRouter initialized with ${openRouterConfig.models.length} models`
      );
    }

    // Initialize state
    this.state = {
      config: this.config,
      balance: "0",
      positions: [],
      executionHistory: [],
      launchedTokens: [],
      totalProfitLoss: "0",
      winCount: 0,
      lossCount: 0,
      totalModelCost: "0",
      totalGasUsed: "0",
    };

    // Initialize status
    this.status = {
      agentId: this.config.agentId,
      status: "stopped",
      isRunning: false,
      executionCount: 0,
      currentIntervalMs: this.config.reviewIntervalMs,
      totalProfitLoss: "0",
      winRate: 0,
      openPositions: 0,
    };

    // Initialize dashboard client (if URL provided)
    if (this.config.dashboardUrl) {
      this.dashboard = new DashboardClient(
        this.config.dashboardUrl,
        this.config.agentId
      );
    }

    // Log configuration
    this.logConfiguration();
  }

  /**
   * Log configuration summary
   */
  private logConfiguration(): void {
    console.log(`\n📋 Agent Configuration:`);
    console.log(`   Agent ID: ${this.config.agentId}`);
    console.log(`   Review Interval: ${this.config.reviewIntervalMs / 1000}s`);
    console.log(`   Max Position Size: ${Number(this.config.maxPositionSizeUSDC) / 1e6} USDC`);
    console.log(`   Max Positions: ${this.config.maxPositions}`);
    console.log(`   Model: ${this.config.modelName || 'openai/gpt-4o-mini'}`);
  }

  /**
   * Start the agent execution loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Agent is already running");
    }

    this.isRunning = true;
    this.isPaused = false;
    this.status.status = "running";
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
        console.error(
          `Agent ${this.config.agentId} onStart hook error:`,
          error
        );
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
    const mode = this.config.executionMode || "auto";

    if (mode === "auto") {
      // Auto-detect based on ETH balance
      const hasEth = await this.client.hasEnoughEthForSelfExecute();
      const selectedMode = hasEth ? "self-execute" : "gasless";
      this.client.setExecutionMode(selectedMode);

      const ethBalance = await this.client.getEthBalance();
      const ethBalanceFormatted = (Number(ethBalance) / 1e18).toFixed(4);

      console.log(`\n💰 Execution Mode: ${selectedMode.toUpperCase()}`);
      console.log(`   ETH Balance: ${ethBalanceFormatted} ETH`);
      if (selectedMode === "gasless") {
        console.log(
          `   💸 Using Gasless (Premium): No ETH required, 2 USDC per trade`
        );
      } else {
        console.log(
          `   ⚡ Using Self-Execute (Economy): Agent pays gas, 0.01 USDC per trade`
        );
      }
    } else {
      // Use explicit mode from config
      this.client.setExecutionMode(mode);
      console.log(`\n💰 Execution Mode: ${mode.toUpperCase()} (explicit)`);
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.status.status = "stopped";
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
    this.status.status = "paused";

    if (this.hooks.onPause) {
      try {
        await this.hooks.onPause();
      } catch (error: any) {
        console.error(
          `Agent ${this.config.agentId} onPause hook error:`,
          error
        );
      }
    }
  }

  /**
   * Resume the agent
   */
  async resume(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Agent is not running. Use start() instead.");
    }

    this.isPaused = false;
    this.status.status = "running";

    if (this.hooks.onResume) {
      try {
        await this.hooks.onResume();
      } catch (error: any) {
        console.error(
          `Agent ${this.config.agentId} onResume hook error:`,
          error
        );
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
   * Set initial execution history (useful for loading from database on restart)
   * This allows the agent to "remember" past failures even after restart
   */
  setInitialExecutionHistory(history: AgentExecutionResult[]): void {
    if (history && history.length > 0) {
      // Keep only recent history (last 10)
      this.state.executionHistory = history.slice(-10);
      console.log(`[AgentRunner] Loaded ${history.length} execution history records`);
    }
  }

  /**
   * Get current execution phase
   */
  getCurrentPhase(): import('./interfaces').ExecutionPhase {
    return this.currentPhase;
  }

  /**
   * Set execution phase and notify via callback
   */
  private async setPhase(phase: import('./interfaces').ExecutionPhase, details?: string): Promise<void> {
    this.currentPhase = phase;
    this.status.currentPhase = phase;
    this.status.phaseDetails = details;
    this.status.phaseChangedAt = Date.now();
    
    // Notify via callback if provided
    if (this.config.onPhaseChange) {
      try {
        await this.config.onPhaseChange(phase, details);
      } catch (error) {
        console.error(`[AgentRunner] onPhaseChange callback error:`, error);
      }
    }
    
    // Also notify dashboard if available
    if (this.dashboard) {
      try {
        await this.dashboard.notifyPhaseChange?.(phase, details);
      } catch (error) {
        // Silently ignore dashboard errors
      }
    }
  }

  /**
   * Main execution loop
   */
  private async executionLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if paused
        if (this.isPaused) {
          await this.setPhase('paused', 'Agent is paused');
          await this.sleep(1000);
          continue;
        }

        // Check working hours
        if (!this.isWithinWorkingHours()) {
          await this.setPhase('idle', 'Outside working hours');
          await this.sleep(60000); // Check every minute
          continue;
        }

        // Set phase to fetching_market before starting the cycle (ensures immediate execution on start)
        await this.setPhase('fetching_market', 'Reviewing portfolio and making decisions');

        // Execute one cycle
        const cycleStartTime = Date.now();
        const result = await this.executeOneCycle();
        const executionTimeMs = Date.now() - cycleStartTime;

        // Add execution time to result
        result.executionTimeMs = executionTimeMs;

        // Update status
        this.status.lastExecution = result;
        this.status.executionCount = ++this.executionCount;
        this.state.executionHistory.push(result);

        // Update performance metrics
        this.updatePerformanceMetrics(result);

        // Call onExecution hook
        if (this.hooks.onExecution || this.config.onExecution) {
          try {
            await this.hooks.onExecution?.(result);
            await this.config.onExecution?.(result);
          } catch (error: any) {
            console.error(
              `Agent ${this.config.agentId} onExecution hook error:`,
              error
            );
          }
        }

        // Notify dashboard
        if (this.dashboard) {
          await this.dashboard.notifyExecution(result);
        }

        // Use fixed interval
        const nextInterval = this.config.reviewIntervalMs;
        this.status.currentIntervalMs = nextInterval;
        this.status.nextExecutionAt = Date.now() + nextInterval;

        // Phase: Waiting for next cycle
        await this.setPhase('waiting', `Next review in ${(nextInterval / 1000).toFixed(0)}s`);

        console.log(
          `⏱️  Next execution in ${(nextInterval / 1000).toFixed(1)}s`
        );

        // Wait for next interval
        await this.sleep(nextInterval);
      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} execution error:`, error);

        await this.setPhase('error', error.message);
        this.status.lastError = error;
        this.status.status = "error";

        // CREATE ERROR EXECUTION RECORD so it shows in frontend
        const errorResult: AgentExecutionResult = {
          success: false,
          action: "wait",
          decision: {
            action: "wait",
            params: { reason: `ERROR: ${error.message}` },
            reasoning: `Execution failed: ${error.message}`,
            confidence: 0,
          },
          error: error.message,
          timestamp: Date.now(),
          balanceBefore: this.state.balance || "0",
          balanceAfter: this.state.balance || "0",
        };

        // Call onExecution with error result
        if (this.hooks.onExecution || this.config.onExecution) {
          try {
            await this.hooks.onExecution?.(errorResult);
            await this.config.onExecution?.(errorResult);
          } catch (hookError: any) {
            console.error(
              `Agent ${this.config.agentId} error execution logging failed:`,
              hookError
            );
          }
        }

        // Call onError hook
        if (this.hooks.onError || this.config.onError) {
          try {
            await this.hooks.onError?.(error);
            await this.config.onError?.(error);
          } catch (hookError: any) {
            console.error(
              `Agent ${this.config.agentId} onError hook error:`,
              hookError
            );
          }
        }

        // Wait before retrying
        await this.sleep(10000);
        this.status.status = "running";
      }
    }
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
      if (["buy", "sell"].includes(result.action) && result.success) {
        if (pl > BigInt(0)) {
          this.state.winCount++;
        } else if (pl < BigInt(0)) {
          this.state.lossCount++;
        }

        // Calculate win rate
        const totalTrades = this.state.winCount + this.state.lossCount;
        if (totalTrades > 0) {
          this.status.winRate = Math.round(
            (this.state.winCount / totalTrades) * 100
          );
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

    // Phase: Fetching market data
    await this.setPhase('fetching_market', 'Getting balance and market data...');

    // Get balance
    const balanceBefore = await this.getBalance();
    this.state.balance = balanceBefore;

    // Check minimum balance
    const minBalance = this.config.minBalanceUSDC || "10000"; // 0.01 USDC default
    if (BigInt(balanceBefore) < BigInt(minBalance)) {
      await this.setPhase('error', 'Low balance');
      // Call low balance hook
      if (this.hooks.onLowBalance) {
        try {
          await this.hooks.onLowBalance(balanceBefore);
        } catch (error: any) {
          console.error(
            `Agent ${this.config.agentId} onLowBalance hook error:`,
            error
          );
        }
      }

      return {
        success: false,
        action: "wait",
        decision: {
          action: "wait",
          params: { reason: "Low balance" },
          reasoning: `Balance ${balanceBefore} is below minimum ${minBalance}`,
        },
        error: "Low balance",
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

    // Phase: Building prompt
    await this.setPhase('building_prompt', 'Preparing AI request...');

    // Build prompt and get AI decision
    // Include recent execution history for learning from mistakes
    const recentHistory = this.state.executionHistory.slice(-5).map(h => ({
      action: h.action,
      success: h.success,
      error: h.error,
      reasoning: h.decision?.reasoning,
      timestamp: h.timestamp,
    }));
    
    const prompt = this.aiProvider.buildPrompt(
      this.config,
      marketDataWithPositions,
      balanceBefore,
      this.state.launchedTokens || [],
      {}, // No cooldowns - simplified
      recentHistory // Pass execution history
    );

    // Phase: Calling AI
    await this.setPhase('calling_ai', `Waiting for ${this.config.modelName || 'AI'} response...`);

    // Track model call time
    const modelStartTime = Date.now();

    // Use OpenRouter only if explicitly configured via modelProvider
    let modelResponse: string;
    if (
      this.openRouterProvider &&
      this.config.modelProvider === "openrouter"
    ) {
      modelResponse = await this.openRouterProvider.callModel(
        prompt,
        this.config
      );
    } else {
      // Default to x402 AI provider
      modelResponse = await this.aiProvider.callModel(prompt, this.config);
    }

    const modelLatencyMs = Date.now() - modelStartTime;

    // Phase: Parsing decision
    await this.setPhase('parsing_decision', 'Processing AI response...');

    const decision = this.aiProvider.parseDecision(modelResponse);

    // Add model latency to decision for tracking
    (decision as any).modelLatencyMs = modelLatencyMs;

    // Call onDecision hook
    if (this.hooks.onDecision) {
      try {
        await this.hooks.onDecision(decision);
      } catch (error: any) {
        console.error(
          `Agent ${this.config.agentId} onDecision hook error:`,
          error
        );
      }
    }

    // Phase: Executing action
    await this.setPhase('executing_action', `Executing ${decision.action}...`);

    // Execute decision
    const executionResult = await this.executeDecision(decision);

    // Phase: Recording result
    await this.setPhase('recording_result', 'Saving execution result...');

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
  private async getMarketData(): Promise<{ tokens: any[]; fetchError?: string }> {
    try {
      const { tokens } = await this.client.discoverTokens({
        page: 1,
        limit: 10,
        sortBy: "launchTime",
        sortOrder: "desc",
      });
      return { tokens };
    } catch (error: any) {
      console.warn(`Failed to get market data: ${error.message}`);
      return { 
        tokens: [], 
        fetchError: `Could not fetch market data: ${error.message}. Proceed with launch or other actions that don't require market data.`
      };
    }
  }

  /**
   * Execute agent decision
   */
  private async executeDecision(decision: AgentDecision): Promise<any> {
    try {
      switch (decision.action) {
        case "buy": {
          if (!decision.params?.tokenAddress || !decision.params?.usdcAmount) {
            return { success: false, error: "Missing buy parameters" };
          }

          // Check position limit
          if (this.state.positions.length >= (this.config.maxPositions || 5)) {
            return {
              success: false,
              error: `Maximum positions reached (${this.config.maxPositions}). Sell existing positions first.`,
            };
          }

          // Convert usdcAmount from decimal USDC to atomic units
          let usdcAmountStr = String(decision.params.usdcAmount);
          const decimalAmount = parseFloat(usdcAmountStr);

          if (isNaN(decimalAmount) || decimalAmount < 0) {
            return {
              success: false,
              error: `Invalid usdcAmount format: ${usdcAmountStr}`,
            };
          }

          // Convert to atomic units (6 decimals)
          usdcAmountStr = Math.floor(decimalAmount * 1e6).toString();

          // ENFORCE max position size from config
          const maxPositionSize = BigInt(this.config.maxPositionSizeUSDC);
          let buyAmount = BigInt(usdcAmountStr);

          if (buyAmount > maxPositionSize) {
            console.log(
              `[AgentRunner] ⚠️ AI requested ${
                Number(buyAmount) / 1e6
              } USDC but max is ${Number(maxPositionSize) / 1e6} USDC - capping`
            );
            buyAmount = maxPositionSize;
            usdcAmountStr = maxPositionSize.toString();
          }

          console.log(
            `[AgentRunner] Buying with ${
              Number(buyAmount) / 1e6
            } USDC (${usdcAmountStr} atomic units)`
          );

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

          if (executionMode === "gasless") {
            buyResult = await this.client.buyTokens({
              tokenAddress: decision.params.tokenAddress,
              usdcAmount: usdcAmountStr,
            });
          } else {
            const signedData = await this.client.buyTokensSelfExecute({
              tokenAddress: decision.params.tokenAddress,
              usdcAmount: usdcAmountStr,
            });
            const txHash = await this.client.executeBuyTransaction(signedData);
            buyResult = {
              transactionHash: txHash,
              buyer: this.client.getWalletAddress(),
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: "0",
              usdcPaid: usdcAmountStr,
              averagePricePerToken: "0",
            };
          }

          // Track position
          const newPosition: AgentPosition = {
            tokenAddress: decision.params.tokenAddress,
            tokenAmount: buyResult.tokenAmount,
            usdcInvested: buyResult.usdcPaid,
            entryPrice: buyResult.averagePricePerToken,
            entryTime: Date.now(),
            currentPrice: buyResult.averagePricePerToken,
            unrealizedPL: "0",
            status: "open",
          };
          this.state.positions.push(newPosition);

          return { success: true, ...buyResult };
        }

        case "sell": {
          if (!decision.params?.tokenAddress || !decision.params?.tokenAmount) {
            return { success: false, error: "Missing sell parameters" };
          }

          const sellTokenAddress = decision.params.tokenAddress.toLowerCase();

          // Convert tokenAmount from decimal to atomic units
          let tokenAmountStr = String(decision.params.tokenAmount);
          const decimalTokenAmount = parseFloat(tokenAmountStr);

          if (isNaN(decimalTokenAmount) || decimalTokenAmount < 0) {
            return {
              success: false,
              error: `Invalid tokenAmount format: ${tokenAmountStr}`,
            };
          }

          tokenAmountStr = Math.floor(decimalTokenAmount * 1e18).toString();
          console.log(
            `[AgentRunner] Selling ${decision.params.tokenAmount} tokens (${tokenAmountStr} atomic units)`
          );

          // Execute sell based on execution mode
          const sellExecutionMode = this.client.getExecutionMode();
          let sellResult: any;

          if (sellExecutionMode === "gasless") {
            sellResult = await this.client.sellTokens({
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
            });
          } else {
            const signedData = await this.client.sellTokensSelfExecute({
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
            });
            const txHash = await this.client.executeSellTransaction(signedData);
            sellResult = {
              transactionHash: txHash,
              seller: this.client.getWalletAddress(),
              tokenAddress: decision.params.tokenAddress,
              tokenAmount: tokenAmountStr,
              usdcReceived: "0",
            };
          }

          // Update positions
          const positionIndex = this.state.positions.findIndex(
            (p: any) => p.tokenAddress?.toLowerCase() === sellTokenAddress
          );
          if (positionIndex !== -1) {
            this.state.positions.splice(positionIndex, 1);
          }

          return { success: true, ...sellResult };
        }

        case "launch": {
          const ticker = decision.params?.ticker || decision.params?.symbol;
          if (
            !decision.params?.name ||
            !ticker ||
            !decision.params?.description
          ) {
            return {
              success: false,
              error: `Missing launch parameters. Got: name=${
                decision.params?.name
              }, ticker=${ticker}, description=${decision.params?.description?.substring(
                0,
                20
              )}`,
            };
          }
          const launchResult = await this.client.launchToken({
            name: decision.params.name,
            ticker: ticker.toUpperCase(),
            description: decision.params.description,
            image:
              decision.params.image ||
              `https://via.placeholder.com/400/000000/FFFFFF?text=${encodeURIComponent(
                ticker
              )}`,
            initialSupply: decision.params.initialSupply,
          });

          // Track launched token
          if (launchResult.tokenAddress && this.state.launchedTokens) {
            this.state.launchedTokens.push(
              launchResult.tokenAddress.toLowerCase()
            );
            if (this.state.launchedTokens.length > 10) {
              this.state.launchedTokens.shift();
            }
          }

          return { success: true, ...launchResult };
        }

        case "analyze": {
          if (!decision.params?.tokenAddress) {
            return { success: false, error: "Missing token address" };
          }
          const tokenInfo = await this.client.getTokenInfo(
            decision.params.tokenAddress
          );
          return { success: true, tokenInfo };
        }

        case "discover":
        case "wait":
        default:
          return {
            success: true,
            action: decision.action,
            message: "No action taken",
          };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get agent wallet balance
   */
  private async getBalance(): Promise<string> {
    try {
      const walletAddress = this.client.getWalletAddress();
      const usdcAddress =
        AgentRunner.USDC_ADDRESSES[this.chainId] ||
        AgentRunner.USDC_ADDRESSES[84532];

      const usdcABI = [
        "function balanceOf(address account) view returns (uint256)",
      ];

      const balance = await this.robustProvider.call(async (provider) => {
        const usdcContract = new ethers.Contract(
          usdcAddress,
          usdcABI,
          provider
        );
        return await usdcContract.balanceOf(walletAddress);
      }, "getBalance");

      const balanceString = balance.toString();
      this.state.balance = balanceString;
      this.status.balance = balanceString;

      return balanceString;
    } catch (error: any) {
      console.warn(`Failed to get balance: ${error.message}`);
      return this.state.balance || "0";
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
   * Sell all positions
   */
  async sellAllPositions(): Promise<
    Array<{
      tokenAddress: string;
      success: boolean;
      txHash?: string;
      error?: string;
    }>
  > {
    const results: Array<{
      tokenAddress: string;
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];

    const positions = [...this.state.positions];
    console.log(`[AgentRunner] Selling all ${positions.length} positions...`);

    for (const position of positions) {
      try {
        const tokenAddress = position.tokenAddress;
        const tokenAmount = position.tokenAmount;

        console.log(
          `[AgentRunner] Selling ${tokenAmount} of ${tokenAddress.slice(0, 10)}...`
        );

        const executionMode = this.client.getExecutionMode();
        let sellResult: any;

        if (executionMode === "gasless") {
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
          (p: any) =>
            p.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
        );
        if (positionIndex !== -1) {
          this.state.positions.splice(positionIndex, 1);
        }

        results.push({
          tokenAddress,
          success: true,
          txHash: sellResult.transactionHash,
        });

        console.log(
          `[AgentRunner] ✅ Sold ${tokenAddress.slice(0, 10)} - TX: ${
            sellResult.transactionHash
          }`
        );
      } catch (error: any) {
        console.error(
          `[AgentRunner] ❌ Failed to sell ${position.tokenAddress}:`,
          error.message
        );
        results.push({
          tokenAddress: position.tokenAddress,
          success: false,
          error: error.message,
        });
      }
    }

    this.status.openPositions = this.state.positions.length;

    console.log(
      `[AgentRunner] Sell all complete. ${
        results.filter((r) => r.success).length
      }/${positions.length} sold successfully.`
    );

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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
