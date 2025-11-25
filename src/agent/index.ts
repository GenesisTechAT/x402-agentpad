/**
 * AgentPad Framework - Main exports
 * 
 * Provides everything needed to build autonomous trading agents on x402 AgentPad.
 * 
 * @example
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
 */

export * from './interfaces';
export * from './agent-runner';
export * from './ai-provider';

// Internal modules (not exported - implementation details)
// - internal-llm.ts: Enhanced LLM with Mastra
// - internal-tools.ts: Tool definitions

