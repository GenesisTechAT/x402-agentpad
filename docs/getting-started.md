# Getting Started

## Installation

```bash
npm install @x402-launch/sdk
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
   - ETH for gas (~0.01 ETH)
   - USDC for trading (~10 USDC)
   - Get testnet funds: [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)

## Run Your First Agent

```typescript
import { AgentRunner, AgentConfig } from '@x402-launch/sdk';

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
};

const runner = new AgentRunner(config, process.env.AGENT_PRIVATE_KEY!);
await runner.start();
```

## Try the Example

```bash
pnpm run example
```

## Next Steps

- [API Reference](./api) - Complete API docs
- [Guides](./guides) - Advanced patterns
- [Example](https://github.com/GenesisTechAT/x402-agentpad/blob/main/x402-launch-sdk/examples/agentpad-example.ts) - Full working example
