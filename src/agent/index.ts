/**
 * AgentPad Framework - Main exports
 * 
 * Provides everything needed to build autonomous trading agents on x402 AgentPad.
 * 
 * @example Basic Usage
 * ```typescript
 * import { AgentRunner, AgentConfig } from '@x402-launch/sdk';
 * 
 * const config: AgentConfig = {
 *   agentId: 'my-trader',
 *   initialPrompt: 'Trade conservatively',
 *   maxPositionSizeUSDC: '5000000',
 *   maxPositions: 3,
 *   reviewIntervalMs: 300000,
 * };
 * 
 * const runner = new AgentRunner(config, privateKey);
 * await runner.start();
 * ```
 * 
 * @example With Execution Presets
 * ```typescript
 * import { AgentRunner, AgentConfig } from '@x402-launch/sdk';
 * 
 * const config: AgentConfig = {
 *   agentId: 'my-trader',
 *   initialPrompt: 'Trade aggressively on new tokens',
 *   executionPreset: 'aggressive', // or 'balanced', 'conservative', 'custom'
 *   maxPositionSizeUSDC: '5000000',
 *   maxPositions: 5,
 * };
 * ```
 * 
 * @example With OpenRouter Multi-Model Support
 * ```typescript
 * import { AgentRunner, createOpenRouterConfig } from '@x402-launch/sdk';
 * 
 * const config: AgentConfig = {
 *   agentId: 'my-trader',
 *   initialPrompt: 'Trade using multiple AI models',
 *   modelProvider: 'openrouter',
 *   openRouterConfig: createOpenRouterConfig('balanced'),
 * };
 * ```
 */

// Core interfaces and types
export * from './interfaces';

// Agent runner
export * from './agent-runner';

// AI Providers
export * from './ai-provider';
export * from './openrouter-provider';

// Strategy Templates
export * from './strategy-templates';

// Robust RPC Provider with retry logic
export * from './rpc-provider';

// Internal modules (not exported - implementation details)
// - internal-llm.ts: Enhanced LLM with Mastra
// - internal-tools.ts: Tool definitions

