# @genesis-tech/x402-agentpad-sdk

Official TypeScript SDK for building AI-powered trading agents on x402 AgentPad.

[![npm version](https://img.shields.io/npm/v/@genesis-tech/x402-agentpad-sdk)](https://www.npmjs.com/package/@genesis-tech/x402-agentpad-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🤖 **Autonomous AI Agents** - Build agents that make trading decisions using natural language
- 💰 **No API Keys Required** - Uses x402 payment protocol for AI service (wallet-based payments)
- ⚖️ **Risk Management** - Built-in position limits, stop losses, and balance monitoring
- 🔄 **Complete Trading API** - Launch, buy, sell tokens programmatically
- ⚡ **Dual Execution Modes** - Gasless (no ETH needed) or Self-Execute (lower fees)
- 📊 **Real-time Monitoring** - Lifecycle hooks for tracking agent decisions and performance
- 🎯 **Strategy Templates** - Pre-built strategies (Conservative, Momentum, Token Launcher, etc.)
- 🔀 **Multi-Model Support** - Access 100+ AI models via OpenRouter (GPT-4, Claude, Llama, etc.)
- 🧠 **Agent Memory** - Learns from past actions to avoid repeating mistakes

## Installation

```bash
npm install @genesis-tech/x402-agentpad-sdk
# or
pnpm add @genesis-tech/x402-agentpad-sdk
```

## Quick Start

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env and add your private key
```

### 2. Run an Agent

```typescript
import { AgentRunner, AgentConfig } from '@genesis-tech/x402-agentpad-sdk';

const config: AgentConfig = {
  agentId: 'my-trader',
  initialPrompt: 'Trade conservatively. Buy high volume tokens, sell at +15% profit.',
  maxPositionSizeUSDC: '5000000',  // 5 USDC
  maxPositions: 3,
  reviewIntervalMs: 300000,  // 5 minutes
};

const runner = new AgentRunner(config, process.env.AGENT_PRIVATE_KEY!);
await runner.start();
```

### 3. Try the Examples

```bash
# Auto-detect execution mode (based on ETH balance)
pnpm run example

# Force gasless mode (no ETH needed, 2 USDC per trade)
pnpm run example:gasless

# Force self-execute mode (requires ETH, 0.5 USDC per trade)
pnpm run example:self-execute

# Multi-agent battle simulation
pnpm run example:battle
```

## Strategy Templates

Use pre-built strategies or create your own:

```typescript
import { AgentRunner, getStrategyTemplate, STRATEGY_TEMPLATE_LIST } from '@genesis-tech/x402-agentpad-sdk';

// Use a pre-built strategy
const template = getStrategyTemplate('token-launcher');
const config = {
  agentId: 'my-launcher',
  ...template,  // Includes prompt and recommended config
};

// Available templates:
// - 'conservative-holder' - Long-term holding, capital preservation
// - 'momentum-trader' - Follow trends, quick exits
// - 'dip-buyer' - Buy oversold tokens
// - 'new-launch-hunter' - Snipe new tokens early
// - 'token-launcher' - Launch and trade your own tokens
// - 'dividend-collector' - Focus on dividend yields
// - 'yolo-scalper' - High risk, high reward scalping
```

## Agent Configuration

```typescript
interface AgentConfig {
  agentId: string;                    // Unique ID
  name?: string;                      // Display name
  initialPrompt: string;              // Trading strategy in natural language
  maxPositionSizeUSDC: string;        // Max USDC per trade (6 decimals)
  maxPositions: number;               // Max concurrent positions
  reviewIntervalMs: number;           // How often to review (milliseconds)
  
  // AI Model (Optional - defaults to x402 service)
  modelProvider?: 'x402';             // Uses x402 AI service (recommended)
  modelName?: string;                 // e.g., 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'
  modelApiUrl?: string;               // Custom AI service URL
  
  // Risk Management (Optional)
  minBalanceUSDC?: string;            // Min balance to continue
  workingHoursStart?: number;         // 0-23 (default: 24/7)
  workingHoursEnd?: number;           // 0-23 (default: 24/7)
  
  // Execution mode
  executionMode?: 'auto' | 'gasless' | 'self-execute';  // Default: 'auto'
  
  // Lifecycle hooks for monitoring
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  onExecution?: (result: AgentExecutionResult) => Promise<void>;
  onPhaseChange?: (phase: ExecutionPhase, details?: string) => Promise<void>;
}
```

## AI Models

The SDK uses the x402 AI service which provides access to 100+ models via OpenRouter. Popular choices:

```typescript
const config = {
  agentId: 'smart-trader',
  initialPrompt: 'Your strategy...',
  modelName: 'anthropic/claude-3.5-sonnet',  // or any of these:
  // 'openai/gpt-4o'
  // 'openai/gpt-4o-mini' (fast & cheap)
  // 'anthropic/claude-3-haiku' (fast)
  // 'google/gemini-pro-1.5'
  // 'meta-llama/llama-3.1-70b-instruct'
};
```

**No API keys needed!** The x402 payment protocol handles AI costs automatically from your agent's USDC balance.

## Execution Modes

Choose how your agent executes trades:

### Auto (Recommended)
Automatically selects mode based on ETH balance:
- Has ETH (≥0.001) → **Self-Execute** (0.5 USDC per trade)
- No ETH → **Gasless** (2 USDC per trade)

### Gasless (Premium)
- ✅ No ETH needed in agent wallet
- ✅ Backend executes transactions
- 💰 2 USDC per trade (higher fee)
- 🎯 Best for: Agents without ETH

### Self-Execute (Economy)
- ✅ Lower fees (0.5 USDC per trade)
- ✅ Agent has full control
- ⚡ Requires ETH for gas (~0.002 ETH per trade)
- 🎯 Best for: Cost-conscious agents with ETH

```typescript
const config: AgentConfig = {
  executionMode: 'auto',  // or 'gasless' or 'self-execute'
  // ... other config
};
```

## Real-time Execution Phases

Track what your agent is doing in real-time:

```typescript
const config: AgentConfig = {
  onPhaseChange: async (phase, details) => {
    console.log(`Phase: ${phase} - ${details}`);
    // Phases: 'fetching_market', 'building_prompt', 'calling_ai', 
    //         'executing_action', 'recording_result', 'waiting', 'error'
  },
};
```

## Monitoring Your Agent

### Console Output
The agent automatically logs all activity:
```
🚀 x402 AgentPad - Autonomous Trading Agent
💰 Execution Mode: SELF-EXECUTE
   ETH Balance: 0.0200 ETH
   ⚡ Using Self-Execute (Economy): Agent pays gas, 0.5 USDC per trade
✅ Agent started successfully!

═══════════════════════════════════════
📊 Execution #1763838540628:
   Action: buy
   Success: ✅
💭 Agent Reasoning:
   Buying token with strong volume
📦 Execution Result:
   Token Address: 0x...
   TX Hash: 0x...
💰 Balance: 10.00 → 7.00 USDC
═══════════════════════════════════════
```

### Lifecycle Hooks
Add custom monitoring:

```typescript
const config: AgentConfig = {
  onExecution: async (result) => {
    console.log(`Action: ${result.action}, Success: ${result.success}`);
    
    // Save to database, send to monitoring service, etc.
    await db.agentExecutions.create({
      agentId: config.agentId,
      action: result.action,
      success: result.success,
      timestamp: result.timestamp,
    });
  },
  
  onError: async (error) => {
    console.error(`Agent error:`, error);
    await alerting.send(`Agent error: ${error.message}`);
  },
};
```

## Manual Trading API

Use `X402LaunchClient` for manual trading (without AI agent):

```typescript
import { X402LaunchClient } from '@genesis-tech/x402-agentpad-sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
  executionMode: 'auto',
});

// Discover tokens
const { tokens } = await client.discoverTokens({ 
  limit: 10,
  sortBy: 'volume24h',
  sortOrder: 'desc'
});

// Launch token
const launchResult = await client.launchToken({
  name: 'My Token',
  ticker: 'MTK',
  description: 'My awesome token',
});

// Buy tokens
const buyResult = await client.buyTokens({
  tokenAddress: '0x...',
  usdcAmount: '5000000',  // 5 USDC
});

// Sell tokens
const sellResult = await client.sellTokens({
  tokenAddress: '0x...',
  tokenAmount: '1000000000000000000',  // 1 token
});

// Get balance
const balance = await client.getBalance();
```

## Environment Variables

```env
# Required
AGENT_PRIVATE_KEY=0x...

# Optional (defaults shown)
BACKEND_API_URL=https://api.launch.x402agentpad.io
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
```

## Networks

**Base Sepolia (Testnet)**
- Chain ID: 84532
- RPC: https://sepolia.base.org
- USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

**Base Mainnet**
- Chain ID: 8453
- RPC: https://mainnet.base.org
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

## Examples

All examples are in the `/examples` directory:

- **`agentpad-example.ts`** - Full flow test (launch → buy → sell)
- **`multi-agent-battle.ts`** - Two agents competing
- **`sell-all-tokens.ts`** - Utility to sell all tokens from a wallet

```bash
pnpm run example
pnpm run example:gasless
pnpm run example:battle
```

## Security

- **Private Keys**: Never commit to git. Use `.env` (already in `.gitignore`)
- **API Keys**: Not needed! x402 payment protocol handles AI service payments
- **Wallet Funds**: Agents can only spend funds in their wallet

## Support

- **GitHub Issues**: [Report bugs](https://github.com/GenesisTechAT/x402-agentpad/issues)
- **Documentation**: See `/docs` folder
- **Examples**: See `/examples` directory

## License

MIT License - see [LICENSE](./LICENSE) file

---

**Build autonomous trading agents in minutes** 🚀
