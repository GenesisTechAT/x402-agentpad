/**
 * Agent Framework Interfaces
 * 
 * Provides abstractions for building autonomous trading agents
 */

import { X402LaunchClient } from '../client';
import { TokenInfo } from '../types';

/**
 * Execution mode presets for different trading styles
 */
export type ExecutionModePreset = 'aggressive' | 'balanced' | 'conservative' | 'custom';

/**
 * Dynamic interval configuration
 * Allows agents to adjust execution speed based on market conditions
 */
export interface DynamicIntervalConfig {
  /** Base interval in milliseconds (default execution speed) */
  baseIntervalMs: number;
  
  /** Fast mode interval - used during high activity (e.g., 30000 = 30s) */
  fastIntervalMs: number;
  
  /** Slow mode interval - used during low activity (e.g., 600000 = 10min) */
  slowIntervalMs: number;
  
  /** Conditions that trigger fast mode */
  triggerFastOn: ('volatility' | 'trade_executed' | 'position_change' | 'high_volume' | 'new_token')[];
  
  /** Conditions that trigger slow mode */
  triggerSlowOn: ('low_volume' | 'outside_hours' | 'holding_positions' | 'low_balance')[];
  
  /** How long to stay in fast mode after trigger (ms) */
  fastModeDurationMs?: number;
  
  /** Minimum time between same action type (prevents spam) */
  actionCooldownMs?: number;
}

/**
 * Action priority configuration
 * Allows users to customize which actions take precedence
 */
export interface ActionPriority {
  /** Action type */
  action: 'buy' | 'sell' | 'launch' | 'analyze' | 'discover' | 'wait';
  
  /** Priority level (1 = highest, 5 = lowest) */
  priority: 1 | 2 | 3 | 4 | 5;
  
  /** Minimum time between this action type (ms) */
  cooldownMs?: number;
  
  /** Maximum times this action can execute per hour */
  maxPerHour?: number;
  
  /** Whether this action is enabled */
  enabled?: boolean;
}

/**
 * Preset configurations for different trading styles
 */
export const EXECUTION_PRESETS: Record<ExecutionModePreset, Partial<AgentConfig>> = {
  aggressive: {
    reviewIntervalMs: 30000,  // 30 seconds
    dynamicInterval: {
      baseIntervalMs: 30000,
      fastIntervalMs: 15000,
      slowIntervalMs: 60000,
      triggerFastOn: ['trade_executed', 'new_token', 'high_volume'],
      triggerSlowOn: ['low_volume', 'low_balance'],
      fastModeDurationMs: 300000, // 5 min
      actionCooldownMs: 10000,
    },
    actionPriorities: [
      { action: 'buy', priority: 1, maxPerHour: 20 },
      { action: 'sell', priority: 1, maxPerHour: 20 },
      { action: 'discover', priority: 2, maxPerHour: 30 },
      { action: 'analyze', priority: 3, maxPerHour: 10 },
      { action: 'launch', priority: 4, maxPerHour: 2 },
      { action: 'wait', priority: 5 },
    ],
  },
  balanced: {
    reviewIntervalMs: 120000,  // 2 minutes
    dynamicInterval: {
      baseIntervalMs: 120000,
      fastIntervalMs: 60000,
      slowIntervalMs: 300000,
      triggerFastOn: ['trade_executed', 'position_change'],
      triggerSlowOn: ['low_volume', 'outside_hours', 'holding_positions'],
      fastModeDurationMs: 600000, // 10 min
      actionCooldownMs: 30000,
    },
    actionPriorities: [
      { action: 'sell', priority: 1, maxPerHour: 10 },
      { action: 'buy', priority: 2, maxPerHour: 10 },
      { action: 'analyze', priority: 2, maxPerHour: 15 },
      { action: 'discover', priority: 3, maxPerHour: 20 },
      { action: 'launch', priority: 4, maxPerHour: 1 },
      { action: 'wait', priority: 5 },
    ],
  },
  conservative: {
    reviewIntervalMs: 600000,  // 10 minutes
    dynamicInterval: {
      baseIntervalMs: 600000,
      fastIntervalMs: 300000,
      slowIntervalMs: 1800000,  // 30 min
      triggerFastOn: ['position_change'],
      triggerSlowOn: ['low_volume', 'outside_hours', 'holding_positions', 'low_balance'],
      fastModeDurationMs: 900000, // 15 min
      actionCooldownMs: 120000,
    },
    actionPriorities: [
      { action: 'sell', priority: 1, maxPerHour: 5 },
      { action: 'analyze', priority: 2, maxPerHour: 10 },
      { action: 'discover', priority: 2, maxPerHour: 10 },
      { action: 'buy', priority: 3, maxPerHour: 3 },
      { action: 'launch', priority: 5, maxPerHour: 0, enabled: false },
      { action: 'wait', priority: 4 },
    ],
  },
  custom: {
    // User provides all settings
  },
};

/**
 * Agent configuration
 */
export interface AgentConfig {
  agentId: string;
  name?: string;
  
  // Trading strategy
  initialPrompt: string; // Natural language strategy
  
  // Risk management
  maxPositionSizeUSDC: string; // Max position size in USDC (6 decimals)
  maxPositions: number; // Max concurrent positions
  minBalanceUSDC?: string; // Minimum balance to continue (default: 0.01 USDC)
  
  // Execution - Basic
  reviewIntervalMs: number; // How often to review portfolio (legacy, use dynamicInterval for advanced)
  executionMode?: 'gasless' | 'self-execute' | 'auto'; // Default: 'auto' (detect based on ETH balance)
  
  // Execution - Advanced (NEW)
  executionPreset?: ExecutionModePreset; // 'aggressive' | 'balanced' | 'conservative' | 'custom'
  dynamicInterval?: DynamicIntervalConfig; // Dynamic interval configuration
  actionPriorities?: ActionPriority[]; // Custom action priorities
  
  // AI Model configuration
  modelProvider?: string; // 'openai', 'anthropic', 'openrouter', 'custom'
  modelName?: string; // Model name
  modelApiUrl?: string; // Custom model API URL (x402 enabled)
  
  // OpenRouter configuration (NEW)
  openRouterConfig?: OpenRouterConfig;
  
  // Working hours
  workingHoursStart?: number; // 0-23, default 0 (24/7)
  workingHoursEnd?: number; // 0-23, default 23 (24/7)
  
  // Dashboard (optional - for local monitoring)
  dashboardUrl?: string; // e.g. 'http://localhost:3030'
  
  // Hosting expiration (optional - undefined = unlimited for local hosting)
  expiresAt?: Date; // When hosting expires
  
  // Optional callbacks
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onExecution?: (result: AgentExecutionResult) => void | Promise<void>;
}

/**
 * OpenRouter configuration for multi-model support
 */
export interface OpenRouterConfig {
  /** OpenRouter API key (optional - can use x402 payment) */
  apiKey?: string;
  
  /** Base URL for OpenRouter API */
  baseUrl?: string;
  
  /** Available models to use */
  models: OpenRouterModel[];
  
  /** Strategy for selecting models */
  routingStrategy: 'primary-fallback' | 'cost-optimized' | 'task-based' | 'round-robin';
  
  /** Enable automatic fallback on errors */
  enableFallback?: boolean;
  
  /** Maximum retries before switching models */
  maxRetriesPerModel?: number;
}

/**
 * OpenRouter model configuration
 */
export interface OpenRouterModel {
  /** Model ID (e.g., 'anthropic/claude-3-opus', 'openai/gpt-4o') */
  id: string;
  
  /** Display name for UI */
  displayName?: string;
  
  /** Role in routing strategy */
  role: 'primary' | 'fallback' | 'cheap' | 'premium';
  
  /** Task types this model is best for */
  bestFor?: ('analysis' | 'decision' | 'simple')[];
  
  /** Maximum tokens for this model */
  maxTokens?: number;
  
  /** Temperature setting (0-1) */
  temperature?: number;
  
  /** Cost per 1K tokens (for cost optimization) */
  costPer1kTokens?: number;
}

/**
 * Agent decision from AI model
 */
export interface AgentDecision {
  action: 'buy' | 'sell' | 'launch' | 'discover' | 'analyze' | 'wait' | 'stop';
  params?: Record<string, any>;
  reasoning: string;
  confidence?: number; // 0-1
  modelCallCost?: string; // Cost in USDC
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  success: boolean;
  action: string;
  decision: AgentDecision;
  marketData?: any;
  executionResult?: any;
  error?: string;
  timestamp: number;
  balanceBefore?: string;
  balanceAfter?: string;
  
  // Enhanced metrics (NEW)
  profitLoss?: string;           // P/L in USDC for this execution
  executionTimeMs?: number;      // How long the execution took
  modelLatencyMs?: number;       // AI model response time
  gasUsed?: string;              // Gas used (self-execute mode)
  intervalMode?: 'fast' | 'base' | 'slow'; // What interval mode was active
}

/**
 * Agent status
 */
export interface AgentStatus {
  agentId: string;
  status: 'running' | 'stopped' | 'paused' | 'error';
  isRunning: boolean;
  startedAt?: number;
  stoppedAt?: number;
  executionCount: number;
  lastExecution?: AgentExecutionResult;
  lastError?: Error;
  balance?: string;
  
  // Dynamic execution state (NEW)
  currentIntervalMode?: 'fast' | 'base' | 'slow';
  currentIntervalMs?: number;
  nextExecutionAt?: number;
  
  // Performance summary (NEW)
  totalProfitLoss?: string;
  winRate?: number;          // Percentage (0-100)
  openPositions?: number;
}

/**
 * Agent strategy interface
 * 
 * Implement this to create custom agent strategies
 */
export interface IAgentStrategy {
  /**
   * Make a trading decision based on market data
   */
  makeDecision(
    client: X402LaunchClient,
    marketData: { tokens: TokenInfo[] },
    agentState: AgentState
  ): Promise<AgentDecision>;
}

/**
 * Position tracking
 */
export interface AgentPosition {
  tokenAddress: string;
  tokenAmount: string;
  usdcInvested: string;
  entryPrice: string;
  entryTime: number;
  currentPrice?: string;
  unrealizedPL?: string;
  status: 'open' | 'closed' | 'partial';
}

/**
 * Action execution tracking for rate limiting
 */
export interface ActionTracker {
  action: string;
  lastExecutedAt: number;
  executionsThisHour: number;
  hourStartedAt: number;
}

/**
 * Agent state (internal)
 */
export interface AgentState {
  config: AgentConfig;
  balance: string;
  positions: AgentPosition[]; // Current positions with full tracking
  executionHistory: AgentExecutionResult[];
  launchedTokens?: string[]; // Track tokens we launched (for token launcher strategy)
  
  // Dynamic interval state (NEW)
  currentIntervalMode: 'fast' | 'base' | 'slow';
  fastModeExpiresAt?: number; // When fast mode should end
  
  // Action tracking for rate limiting (NEW)
  actionTrackers: ActionTracker[];
  
  // Performance metrics (NEW)
  totalProfitLoss: string;      // Total P/L in USDC
  winCount: number;             // Number of profitable trades
  lossCount: number;            // Number of losing trades
  totalModelCost: string;       // Total spent on AI calls
  totalGasUsed: string;         // Total gas spent (self-execute)
}

/**
 * AI Model Provider interface
 */
export interface IAIModelProvider {
  /**
   * Call AI model with prompt and get decision
   */
  callModel(prompt: string, config: AgentConfig): Promise<string>;
}

/**
 * Agent lifecycle hooks
 */
export interface AgentLifecycleHooks {
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onPause?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onExecution?: (result: AgentExecutionResult) => void | Promise<void>;
  onLowBalance?: (balance: string) => void | Promise<void>;
  onDecision?: (decision: AgentDecision) => void | Promise<void>;
}

