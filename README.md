# @x402-launch/sdk

Official TypeScript SDK for building AI-powered trading agents on x402 AgentPad.

[![npm version](https://img.shields.io/npm/v/@genesis-tech/x402-agentpad-sdk)](https://www.npmjs.com/package/@genesis-tech/x402-agentpad-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🤖 **Autonomous AI Agents** - Build agents that make trading decisions using natural language
- 💰 **No API Keys** - Uses x402 payment protocol for AI service (wallet-based payments)
- ⚖️ **Risk Management** - Built-in position limits, stop losses, and balance monitoring
- 🔄 **Complete Trading API** - Launch, buy, sell tokens programmatically
- ⚡ **Dual Execution Modes** - Gasless (no ETH needed) or Self-Execute (lower fees)
- 📊 **Real-time Monitoring** - Lifecycle hooks for tracking agent decisions and performance

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
import { AgentRunner, AgentConfig } from '@x402-launch/sdk';

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

## Agent Configuration

```typescript
interface AgentConfig {
  agentId: string;                    // Unique ID
  initialPrompt: string;              // Trading strategy in natural language
  maxPositionSizeUSDC: string;        // Max USDC per trade (6 decimals)
  maxPositions: number;               // Max concurrent positions
  reviewIntervalMs: number;           // How often to review (milliseconds)
  
  // Optional
  modelProvider?: string;             // Default: 'openai'
  modelName?: string;                 // Default: 'gpt-4'
  minBalanceUSDC?: string;            // Min balance to continue
  workingHoursStart?: number;         // 0-23 (default: 24/7)
  workingHoursEnd?: number;           // 0-23 (default: 24/7)
  
  // Lifecycle hooks for monitoring
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  onExecution?: (result: AgentExecutionResult) => Promise<void>;
  
  // Execution mode
  executionMode?: 'auto' | 'gasless' | 'self-execute';  // Default: 'auto'
}
```

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

Or use command-line flags:
```bash
tsx examples/agentpad-example.ts --gasless
tsx examples/agentpad-example.ts --self-execute
```

## Monitoring Your Agent

### Local Dashboard (Recommended)
Run the included dashboard server for a web-based UI:

```bash
# Terminal 1: Start dashboard server
pnpm run dashboard

# Terminal 2: Run your agent with dashboard URL
```

Then add `dashboardUrl` to your agent config:

```typescript
const config: AgentConfig = {
  agentId: 'my-trader',
  dashboardUrl: 'http://localhost:3030',  // ← Add this!
  // ... other config
};
```

Open `http://localhost:3030` to see real-time updates! 🎉

### Console Output
The agent automatically logs all activity to the console:
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
   Cost: 3.00 USDC (trade + fee)
═══════════════════════════════════════
```

### Lifecycle Hooks
Add custom monitoring via lifecycle hooks:

```typescript
const config: AgentConfig = {
  agentId: 'my-trader',
  initialPrompt: 'Your strategy...',
  
  // Monitor every execution
  onExecution: async (result) => {
    console.log(`Action: ${result.action}, Success: ${result.success}`);
    
    // Save to database
    await db.agentExecutions.create({
      agentId: config.agentId,
      action: result.action,
      success: result.success,
      timestamp: result.timestamp,
      balanceAfter: result.balanceAfter,
    });
    
    // Send to monitoring service (Datadog, Sentry, etc.)
    await monitoring.track('agent_execution', {
      agent: config.agentId,
      action: result.action,
      success: result.success,
    });
  },
  
  // Monitor errors
  onError: async (error) => {
    console.error(`Agent error:`, error);
    await alerting.send(`Agent ${config.agentId} error: ${error.message}`);
  },
  
  // Monitor low balance
  onLowBalance: async (balance) => {
    console.warn(`Low balance: ${balance}`);
    await alerting.send(`Agent ${config.agentId} needs funding!`);
  },
};
```

### Integration with Backend Monitoring
For production deployments, the agent-execution-service provides:
- 📊 **Prometheus Metrics** - Track performance, trades, errors
- 📈 **Grafana Dashboards** - Visualize agent activity
- 🗄️ **Database Logging** - All executions stored in Postgres
- 🔔 **Real-time WebSockets** - Stream updates to your frontend

See `packages/agent-execution-service/` for the hosted agent infrastructure.

## Manual Trading API

Use `X402LaunchClient` for manual trading (without AI agent):

```typescript
import { X402LaunchClient } from '@x402-launch/sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
  executionMode: 'auto',  // 'auto', 'gasless', or 'self-execute'
});

// Discover tokens (costs ~0.10 USDC)
const { tokens } = await client.discoverTokens({ 
  limit: 10,
  sortBy: 'volume24h',  // or 'launchTime', 'marketCap'
  sortOrder: 'desc'
});

// Launch token (costs ~1.10 USDC)
const launchResult = await client.launchToken({
  name: 'My Token',
  ticker: 'MTK',
  description: 'My awesome token',
  image: 'https://example.com/image.png',
});

// Buy tokens (gasless: 2 USDC fee | self-execute: 0.5 USDC fee)
const buyResult = await client.buyTokens({
  tokenAddress: '0x...',
  usdcAmount: '5000000',  // 5 USDC (6 decimals)
});

// Sell tokens (gasless: 0 USDC fee* | self-execute: 0.5 USDC fee)
// *Fee taken from sale proceeds
const sellResult = await client.sellTokens({
  tokenAddress: '0x...',
  tokenAmount: '1000000000000000000',  // 1 token (18 decimals)
});

// Get token info
const tokenInfo = await client.getTokenInfo('0x...');

// Check balance
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
# Run any example
pnpm run example
pnpm run example:gasless
pnpm run example:battle

# Sell all tokens from wallet
pnpm run sell-all -- --buyer <PRIVATE_KEY>
```

## Documentation

- 📖 **[Full Documentation](./docs)** - Complete API reference and guides
- 🔧 **[Examples](./examples)** - Working agent examples
- 📊 **[Monitoring Guide](#monitoring-your-agent)** - Track agent performance

## Security

- **Private Keys**: Never commit to git. Use `.env` (already in `.gitignore`)
- **API Keys**: Not needed! x402 payment protocol handles AI service payments
- **Wallet Funds**: Agents can only spend funds in their wallet

## Support

- **GitHub Issues**: [Report bugs](https://github.com/GenesisTechAT/x402-agentpad/issues)
- **Documentation**: See `/docs` folder
- **Example**: See `/examples/agentpad-example.ts`

## License

MIT License - see [LICENSE](./LICENSE) file

---

**Build autonomous trading agents in minutes** 🚀
