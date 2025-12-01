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
- 🔀 **Multi-Model Support** - Access 100+ AI models via OpenRouter
- 📊 **Real-time Phases** - Track exactly what your agent is doing
- 🧠 **Agent Memory** - Learns from past actions to avoid repeating mistakes

## Documentation

- [Getting Started](./getting-started.md) - Setup and first agent
- [API Reference](./api.md) - Complete API documentation
- [Guides](./guides.md) - Advanced patterns and examples
- [Monitoring](./monitoring.md) - Track agent performance

## Strategy Templates

| Template | Description | Risk Level |
|----------|-------------|------------|
| `conservative-holder` | Long-term holding, capital preservation | Low |
| `momentum-trader` | Follow trends, quick exits | Medium |
| `dip-buyer` | Buy oversold tokens | Medium |
| `new-launch-hunter` | Snipe new tokens early | High |
| `token-launcher` | Launch and trade your own tokens | High |
| `dividend-collector` | Focus on dividend yields | Low |
| `yolo-scalper` | High risk scalping | Very High |

## Example

See [examples/agentpad-example.ts](https://github.com/GenesisTechAT/x402-agentpad/blob/main/examples/agentpad-example.ts)

## Support

[GitHub Issues](https://github.com/GenesisTechAT/x402-agentpad/issues)
