# Guides

## Building Your First Agent

```typescript
import { AgentRunner } from '@x402-launch/sdk';

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

## Monitoring Your Agent

Use lifecycle hooks to monitor execution:

```typescript
const runner = new AgentRunner({
  // ... config ...
  onExecution: async (result) => {
    console.log(`Action: ${result.action}`);
    console.log(`Success: ${result.success}`);
    
    // Log to database
    await db.logExecution(result);
    
    // Update dashboard
    await updateDashboard(result);
  },
  onError: async (error) => {
    console.error('Agent error:', error);
    await sendAlert(error);
  },
}, privateKey);
```

## Testing Strategies

Test different strategies locally:

```typescript
const strategies = [
  { name: 'Conservative', prompt: '...' },
  { name: 'Aggressive', prompt: '...' },
];

for (const strategy of strategies) {
  const runner = new AgentRunner({
    agentId: `test-${strategy.name}`,
    initialPrompt: strategy.prompt,
    maxPositionSizeUSDC: '1000000',  // 1 USDC for testing
    maxPositions: 2,
    reviewIntervalMs: 60000,  // 1 minute
  }, testPrivateKey);
  
  await runner.start();
  await sleep(3600000);  // Run for 1 hour
  await runner.stop();
  
  const state = runner.getState();
  console.log(`${strategy.name}: ${state.positions.length} positions`);
}
```

## Manual Trading

Use `X402LaunchClient` for manual control:

```typescript
import { X402LaunchClient } from '@x402-launch/sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
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

1. **Start Small** - Test with small amounts first
2. **Monitor Closely** - Use lifecycle hooks for visibility
3. **Set Limits** - Always configure position and size limits
4. **Test Prompts** - Iterate on your trading strategy
5. **Secure Keys** - Never commit private keys to git
6. **Fund Wallet** - Ensure enough USDC for trading + AI payments

