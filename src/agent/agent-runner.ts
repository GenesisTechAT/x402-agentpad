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

import { ethers } from 'ethers';
import { X402LaunchClient } from '../client';
import {
  AgentConfig,
  AgentStatus,
  AgentState,
  AgentDecision,
  AgentExecutionResult,
  AgentLifecycleHooks,
} from './interfaces';
import { X402AIProvider } from './ai-provider';
import { DashboardClient } from './dashboard-client';

export class AgentRunner {
  private client: X402LaunchClient;
  private config: AgentConfig;
  private aiProvider: X402AIProvider;
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
    this.config = config;
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

    // Initialize AI provider
    const wallet = new ethers.Wallet(privateKey);
    const provider = new ethers.JsonRpcProvider(this.rpcUrl, this.chainId);
    const usdcAddress = AgentRunner.USDC_ADDRESSES[this.chainId] || AgentRunner.USDC_ADDRESSES[84532];

    this.aiProvider = new X402AIProvider(wallet, provider, this.chainId, usdcAddress);

    // Initialize state
    this.state = {
      config,
      balance: '0',
      positions: [],
      executionHistory: [],
      launchedTokens: [], // Track tokens we launched
    };

    // Initialize status
    this.status = {
      agentId: config.agentId,
      status: 'stopped',
      isRunning: false,
      executionCount: 0,
    };

    // Initialize dashboard client (if URL provided)
    if (config.dashboardUrl) {
      this.dashboard = new DashboardClient(config.dashboardUrl, config.agentId);
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
   * Main execution loop
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
          await this.sleep(60000); // Check every minute
          continue;
        }

        // Execute one cycle
        const result = await this.executeOneCycle();

        // Update status
        this.status.lastExecution = result;
        this.status.executionCount = ++this.executionCount;
        this.state.executionHistory.push(result);

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

        // Wait for next interval
        await this.sleep(this.config.reviewIntervalMs);

      } catch (error: any) {
        console.error(`Agent ${this.config.agentId} execution error:`, error);

        this.status.lastError = error;
        this.status.status = 'error';

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

    // Build prompt and get AI decision (include launched tokens in context)
    const prompt = this.aiProvider.buildPrompt(
      this.config,
      marketDataWithPositions,
      balanceBefore,
      this.state.launchedTokens || []
    );
    const modelResponse = await this.aiProvider.callModel(prompt, this.config);
    const decision = this.aiProvider.parseDecision(modelResponse);

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
          console.log(`[AgentRunner] Buying with ${decision.params.usdcAmount} USDC (${usdcAmountStr} atomic units)`);

          // Validate buy amount doesn't exceed balance
          const buyAmount = BigInt(usdcAmountStr);
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

          // Track position
          this.state.positions.push({
            tokenAddress: decision.params.tokenAddress,
            tokenAmount: buyResult.tokenAmount,
            usdcInvested: buyResult.usdcPaid,
            entryTime: Date.now(),
            entryPrice: buyResult.averagePricePerToken,
          });

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
          if (!decision.params?.name || !decision.params?.ticker || !decision.params?.description) {
            return { success: false, error: 'Missing launch parameters' };
          }
          const launchResult = await this.client.launchToken({
            name: decision.params.name,
            ticker: decision.params.ticker.toUpperCase(),
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
   * Get agent wallet balance (on-chain)
   */
  private async getBalance(): Promise<string> {
    try {
      const walletAddress = this.client.getWalletAddress();
      const usdcAddress = AgentRunner.USDC_ADDRESSES[this.chainId] || AgentRunner.USDC_ADDRESSES[84532];

      // Query USDC balance from blockchain
      const provider = new ethers.JsonRpcProvider(this.rpcUrl, this.chainId);
      const usdcABI = [
        'function balanceOf(address account) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];
      const usdcContract = new ethers.Contract(usdcAddress, usdcABI, provider);
      const balance = await usdcContract.balanceOf(walletAddress);

      // Update state with actual balance
      const balanceString = balance.toString();
      this.state.balance = balanceString;
      this.status.balance = balanceString;

      return balanceString;
    } catch (error: any) {
      console.warn(`Failed to get balance: ${error.message}`);
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

