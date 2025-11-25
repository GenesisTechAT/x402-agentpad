/**
 * Agent Framework Interfaces
 * 
 * Provides abstractions for building autonomous trading agents
 */

import { X402LaunchClient } from '../client';
import { TokenInfo } from '../types';

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
  executionMode?: 'gasless' | 'self-execute' | 'auto'; // Default: 'auto' (detect based on ETH balance)
  
  // AI Model configuration
  modelProvider?: string; // 'openai', 'anthropic', 'nof1', 'custom'
  modelName?: string; // Model name
  modelApiUrl?: string; // Custom model API URL (x402 enabled)
  
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
 * Agent state (internal)
 */
export interface AgentState {
  config: AgentConfig;
  balance: string;
  positions: any[]; // Current positions
  executionHistory: AgentExecutionResult[];
  launchedTokens?: string[]; // Track tokens we launched (for token launcher strategy)
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

