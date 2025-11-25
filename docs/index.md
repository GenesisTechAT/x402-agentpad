# x402 AgentPad SDK

Build autonomous AI trading agents in TypeScript.

## Quick Start

```bash
npm install @x402-launch/sdk
```

```typescript
import { AgentRunner } from '@x402-launch/sdk';

const runner = new AgentRunner({
  agentId: 'my-trader',
  initialPrompt: 'Trade conservatively',
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
  reviewIntervalMs: 300000,
}, process.env.AGENT_PRIVATE_KEY!);

await runner.start();
```

## Features

- 🤖 **AI-Powered** - Agents make decisions using natural language strategies
- 💰 **No API Keys** - x402 payment protocol handles AI service payments automatically
- ⚖️ **Risk Management** - Built-in position limits and balance monitoring
- 🔄 **Complete API** - Launch, buy, sell tokens programmatically

## Documentation

- [Getting Started](./getting-started) - Setup and first agent
- [API Reference](./api) - Complete API documentation
- [Guides](./guides) - Advanced patterns and examples

## Example

See [examples/agentpad-example.ts](https://github.com/GenesisTechAT/x402-agentpad/blob/main/x402-launch-sdk/examples/agentpad-example.ts)

## Support

[GitHub Issues](https://github.com/GenesisTechAT/x402-agentpad/issues)
