# Guides

## Building Your First Agent

```typescript
import { AgentRunner } from '@genesis-tech/x402-agentpad-sdk';

const runner = new AgentRunner({
  agentId: 'trader-001',
  initialPrompt: 'Buy high volume tokens, sell at +15% profit',
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
  reviewIntervalMs: 300000,
}, process.env.AGENT_PRIVATE_KEY!);

await runner.start();
```

## Writing Effective Prompts

Good prompts are specific and include clear rules:

```typescript
const prompt = `
Conservative trading strategy:

BUYING RULES:
- Only buy tokens with 24h volume > 5000 USDC
- Only buy tokens with progress 20-80%
- Never exceed position limits

SELLING RULES:
- Take profits at +15%
- Cut losses at -8%
- Don't hold > 24 hours

RISK:
- Max 3 concurrent positions
- Max 5 USDC per position
- Always check balance first
`;
```

## Using Strategy Templates

Pre-built strategies are available:

```typescript
import { AgentRunner, getStrategyTemplate, STRATEGY_TEMPLATE_LIST } from '@genesis-tech/x402-agentpad-sdk';

// List available templates
console.log(STRATEGY_TEMPLATE_LIST);
// ['conservative-holder', 'momentum-trader', 'dip-buyer', 'new-launch-hunter', 'token-launcher', ...]

// Use a template
const template = getStrategyTemplate('momentum-trader');
const runner = new AgentRunner({
  agentId: 'momentum-bot',
  ...template,
}, process.env.AGENT_PRIVATE_KEY!);
```

## Real-time Phase Tracking

Monitor exactly what your agent is doing:

```typescript
const runner = new AgentRunner({
  // ... config ...
  onPhaseChange: async (phase, details) => {
    console.log(`Phase: ${phase}`);
    console.log(`Details: ${details}`);
    
    // Phases: 'fetching_market', 'building_prompt', 'calling_ai', 
    //         'executing_action', 'recording_result', 'waiting'
  },
}, privateKey);
```

## Monitoring Your Agent

Use lifecycle hooks to monitor execution:

```typescript
const runner = new AgentRunner({
  // ... config ...
  onExecution: async (result) => {
    console.log(`Action: ${result.action}`);
    console.log(`Success: ${result.success}`);
    console.log(`AI Latency: ${result.modelLatencyMs}ms`);
    
    // Log to database
    await db.logExecution(result);
    
    // Send alerts for failures
    if (!result.success) {
      await sendAlert(`Agent action failed: ${result.error}`);
    }
  },
  onError: async (error) => {
    console.error('Agent error:', error);
    await sendAlert(error.message);
  },
}, privateKey);
```

## Agent Memory

Agents learn from past failures. Load execution history on restart:

```typescript
const runner = new AgentRunner(config, privateKey);

// Load recent executions from your database
const recentExecutions = await db.getRecentExecutions(agentId, 10);
runner.setInitialExecutionHistory(recentExecutions);

await runner.start();
```

## Choosing AI Models

Select the right model for your strategy:

```typescript
const config = {
  // Fast and cheap - good for simple strategies
  modelName: 'openai/gpt-4o-mini',
  
  // Smarter but slower - good for complex analysis
  // modelName: 'anthropic/claude-3.5-sonnet',
  
  // Budget option
  // modelName: 'meta-llama/llama-3.1-70b-instruct',
};
```

## Manual Trading

Use `X402LaunchClient` for manual control:

```typescript
import { X402LaunchClient } from '@genesis-tech/x402-agentpad-sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
  executionMode: 'auto',
});

// Discover tokens
const { tokens } = await client.discoverTokens({ limit: 10 });

// Analyze and buy
const bestToken = tokens.find(t => 
  Number(t.volume24h) > 5000 && 
  t.progress > 20 && 
  t.progress < 80
);

if (bestToken) {
  await client.buyTokens({
    tokenAddress: bestToken.address,
    usdcAmount: '5000000',
  });
}
```

## Working Hours

Set trading hours to avoid overnight trading:

```typescript
const runner = new AgentRunner({
  // ... config ...
  workingHoursStart: 9,   // 9 AM
  workingHoursEnd: 17,    // 5 PM
}, privateKey);
```

## Graceful Shutdown

Always stop agents gracefully:

```typescript
// Handle Ctrl+C
process.on('SIGINT', async () => {
  console.log('Stopping agent...');
  await runner.stop();
  process.exit(0);
});
```

## Error Handling

Agents automatically retry on errors. Add custom error handling:

```typescript
const runner = new AgentRunner({
  // ... config ...
  onError: async (error) => {
    if (error.message.includes('Low balance')) {
      await notifyUser('Please fund your wallet');
      await runner.stop();
    }
  },
}, privateKey);
```

## Best Practices

1. **Start Small** - Test with small amounts first (1-5 USDC positions)
2. **Monitor Closely** - Use lifecycle hooks for visibility
3. **Set Limits** - Always configure position and size limits
4. **Test Prompts** - Iterate on your trading strategy
5. **Secure Keys** - Never commit private keys to git
6. **Fund Wallet** - Ensure enough USDC for trading + AI costs
7. **Use Templates** - Start with pre-built strategies before customizing
8. **Check Phases** - Use `onPhaseChange` to debug slow executions
