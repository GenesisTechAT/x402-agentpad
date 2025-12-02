/**
 * Agent Framework Interfaces
 *
 * Provides abstractions for building autonomous trading agents
 */

import { X402LaunchClient } from "../client";
import { TokenInfo } from "../types";

/**
 * Execution phases for real-time status tracking
 */
export type ExecutionPhase = 
  | 'idle'              // Waiting for next cycle
  | 'queued'            // Job in queue (set by execution service)
  | 'starting'          // Agent starting up
  | 'fetching_market'   // Getting market data
  | 'building_prompt'   // Building AI prompt
  | 'calling_ai'        // Waiting for AI response
  | 'parsing_decision'  // Parsing AI decision
  | 'executing_action'  // Executing buy/sell/launch
  | 'recording_result'  // Saving result
  | 'waiting'           // Waiting for next interval
  | 'error'             // Error occurred
  | 'paused'            // Agent paused
  | 'stopped';          // Agent stopped

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

  // Execution
  reviewIntervalMs: number; // How often to review portfolio
  executionMode?: "gasless" | "self-execute" | "auto"; // Default: 'auto' (detect based on ETH balance)
  txDelayMs?: number; // Delay after blockchain transactions to avoid nonce collisions (default: 2000ms)

  // AI Model configuration
  modelProvider?: string; // 'x402' (recommended), 'openrouter', 'custom'
  modelName?: string; // Model name (e.g., 'openai/gpt-4o-mini')
  modelApiUrl?: string; // Custom model API URL (x402 enabled)

  // OpenRouter configuration (optional - for direct OpenRouter usage)
  openRouterConfig?: OpenRouterConfig;

  // Working hours
  workingHoursStart?: number; // 0-23, default 0 (24/7)
  workingHoursEnd?: number; // 0-23, default 23 (24/7)

  // Dashboard (optional - for local monitoring)
  dashboardUrl?: string; // e.g. 'http://localhost:3030'

  // Optional callbacks
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onExecution?: (result: AgentExecutionResult) => void | Promise<void>;
  onPhaseChange?: (phase: ExecutionPhase, details?: string) => void | Promise<void>;
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
  routingStrategy:
    | "primary-fallback"
    | "cost-optimized"
    | "task-based"
    | "round-robin";

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
  role: "primary" | "fallback" | "cheap" | "premium";

  /** Task types this model is best for */
  bestFor?: ("analysis" | "decision" | "simple")[];

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
  action: "buy" | "sell" | "launch" | "discover" | "analyze" | "wait" | "stop";
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
  marketDataError?: string; // Error message if market data fetch failed
  executionResult?: any;
  error?: string;
  timestamp: number;
  balanceBefore?: string;
  balanceAfter?: string;
  profitLoss?: string; // P/L in USDC for this execution
  executionTimeMs?: number; // How long the execution took
  modelLatencyMs?: number; // AI model response time
  gasUsed?: string; // Gas used (self-execute mode)
}

/**
 * Agent status
 */
export interface AgentStatus {
  agentId: string;
  status: "running" | "stopped" | "paused" | "error";
  isRunning: boolean;
  startedAt?: number;
  stoppedAt?: number;
  executionCount: number;
  lastExecution?: AgentExecutionResult;
  lastError?: Error;
  balance?: string;
  currentIntervalMs?: number;
  nextExecutionAt?: number;
  totalProfitLoss?: string;
  winRate?: number; // Percentage (0-100)
  openPositions?: number;
  // Real-time execution phase tracking
  currentPhase?: ExecutionPhase;
  phaseDetails?: string;
  phaseChangedAt?: number;
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
  status: "open" | "closed" | "partial";
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
  marketDataError?: string; // Last market data error if any
  totalProfitLoss: string; // Total P/L in USDC
  winCount: number; // Number of profitable trades
  lossCount: number; // Number of losing trades
  totalModelCost: string; // Total spent on AI calls
  totalGasUsed: string; // Total gas spent (self-execute)
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
