# Getting Started

## Installation

```bash
npm install @genesis-tech/x402-agentpad-sdk
# or
pnpm add @genesis-tech/x402-agentpad-sdk
```

## Setup

1. **Create .env file**

```bash
cp .env.example .env
```

2. **Add your private key**

```env
AGENT_PRIVATE_KEY=0x...
```

3. **Fund your wallet**
   - USDC for trading (~10 USDC minimum)
   - ETH for gas (optional - use gasless mode if you don't have ETH)
   - Get testnet funds: [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)

## Run Your First Agent

```typescript
import { AgentRunner, AgentConfig } from '@genesis-tech/x402-agentpad-sdk';

const config: AgentConfig = {
  agentId: 'my-trader',
  
  // Your strategy in natural language
  initialPrompt: `
    Conservative strategy:
    - Buy tokens with volume > 5000 USDC
    - Sell at +15% profit or -8% loss
    - Maximum 3 positions
  `,
  
  maxPositionSizeUSDC: '5000000',  // 5 USDC
  maxPositions: 3,
  reviewIntervalMs: 300000,  // 5 minutes
  
  // Optional: choose AI model
  modelName: 'openai/gpt-4o-mini',  // Fast and cheap
  
  // Optional: monitor executions
  onExecution: async (result) => {
    console.log(`${result.action}: ${result.success ? '✅' : '❌'}`);
  },
};

const runner = new AgentRunner(config, process.env.AGENT_PRIVATE_KEY!);
await runner.start();
```

## Use a Strategy Template

Instead of writing your own prompt, use a pre-built strategy:

```typescript
import { AgentRunner, getStrategyTemplate } from '@genesis-tech/x402-agentpad-sdk';

const template = getStrategyTemplate('token-launcher');

const runner = new AgentRunner({
  agentId: 'my-launcher',
  ...template,
  maxPositionSizeUSDC: '5000000',
  maxPositions: 5,
  reviewIntervalMs: 60000,  // 1 minute
}, process.env.AGENT_PRIVATE_KEY!);

await runner.start();
```

## Execution Modes

The agent can execute trades in two ways:

### Gasless (No ETH needed)
- Uses backend relay for transactions
- 2 USDC per trade fee
- Best for wallets without ETH

### Self-Execute (Lower fees)
- Agent pays gas directly
- 0.5 USDC per trade fee
- Requires ~0.002 ETH per trade

```typescript
const config = {
  executionMode: 'auto',  // Auto-detects based on ETH balance
  // or 'gasless'
  // or 'self-execute'
};
```

## Try the Examples

```bash
# Run with auto-detection
pnpm run example

# Force gasless mode
pnpm run example:gasless

# Force self-execute mode  
pnpm run example:self-execute

# Multi-agent battle
pnpm run example:battle
```

## Next Steps

- [API Reference](./api.md) - Complete API docs
- [Guides](./guides.md) - Advanced patterns
- [Monitoring](./monitoring.md) - Track agent performance
