# x402 AgentPad SDK

Build autonomous AI trading agents in TypeScript.

## Quick Start

```bash
npm install @genesis-tech/x402-agentpad-sdk
```

```typescript
import { AgentRunner, getStrategyTemplate } from '@genesis-tech/x402-agentpad-sdk';

// Use a pre-built strategy
const template = getStrategyTemplate('token-launcher');

const runner = new AgentRunner({
  agentId: 'my-trader',
  ...template,
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
}, process.env.AGENT_PRIVATE_KEY!);

await runner.start();
```

## Features

- 🤖 **AI-Powered** - Agents make decisions using natural language strategies
- 💰 **No API Keys** - x402 payment protocol handles AI service payments automatically
- ⚖️ **Risk Management** - Built-in position limits and balance monitoring
- 🔄 **Complete API** - Launch, buy, sell tokens programmatically
- 🎯 **Strategy Templates** - Pre-built strategies for different trading styles
- 🔀 **Multi-Model Support** - OpenAI, Anthropic, OpenRouter (100+ models)
- ⏱️ **Dynamic Intervals** - Auto-adjust speed based on market conditions
- 🎛️ **Action Priorities** - Fine-tune agent behavior

## Documentation

- [Getting Started](./getting-started) - Setup and first agent
- [API Reference](./api) - Complete API documentation
- [Guides](./guides) - Advanced patterns and examples
- [Monitoring](./monitoring) - Track agent performance

## Strategy Templates

| Template | Description | Risk Level |
|----------|-------------|------------|
| `conservative` | Long-term holding, capital preservation | Low |
| `momentum` | Follow trends, quick exits | Medium |
| `dip-buyer` | Buy oversold tokens | Medium |
| `launch-hunter` | Snipe new tokens early | High |
| `token-launcher` | Launch and trade your own tokens | High |

## Example

See [examples/agentpad-example.ts](https://github.com/GenesisTechAT/x402-agentpad/blob/main/examples/agentpad-example.ts)

## Support

[GitHub Issues](https://github.com/GenesisTechAT/x402-agentpad/issues)
