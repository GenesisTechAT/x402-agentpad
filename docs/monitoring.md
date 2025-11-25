# Agent Monitoring Guide

Complete guide to monitoring your autonomous trading agents.

## Overview

x402 AgentPad provides multiple ways to monitor your agents:
1. **Console Output** - Real-time logs (local development)
2. **Lifecycle Hooks** - Custom monitoring integrations
3. **Backend Metrics** - Production monitoring (agent-execution-service)

## Local Development Monitoring

### Console Output

When running agents locally, all activity is automatically logged to the console:

```typescript
import { AgentRunner, AgentConfig } from '@x402-launch/sdk';

const config: AgentConfig = {
  agentId: 'my-trader',
  initialPrompt: 'Your trading strategy...',
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
  reviewIntervalMs: 300000,
};

const runner = new AgentRunner(config, process.env.AGENT_PRIVATE_KEY!);
await runner.start();

// Console output:
// 🚀 x402 AgentPad - Autonomous Trading Agent
// 💰 Execution Mode: SELF-EXECUTE
//    ETH Balance: 0.0200 ETH
// ✅ Agent started successfully!
// 📊 Execution #1: Action: buy, Success: ✅
// 💰 Balance: 10.00 → 7.00 USDC
```

### Lifecycle Hooks

Add custom monitoring logic via lifecycle hooks:

```typescript
const config: AgentConfig = {
  agentId: 'my-trader',
  initialPrompt: 'Your strategy...',
  
  // Called when agent starts
  onStart: async () => {
    console.log('✅ Agent started');
    await notifySlack('Agent started');
  },
  
  // Called after each execution
  onExecution: async (result) => {
    console.log(`Action: ${result.action}, Success: ${result.success}`);
    
    // Log to file
    await fs.appendFile('agent-log.txt', JSON.stringify(result) + '\n');
    
    // Send to external service
    await fetch('https://your-monitoring-service.com/events', {
      method: 'POST',
      body: JSON.stringify({
        agentId: config.agentId,
        action: result.action,
        success: result.success,
        balance: result.balanceAfter,
        timestamp: result.timestamp,
      }),
    });
  },
  
  // Called on errors
  onError: async (error) => {
    console.error('❌ Agent error:', error);
    await notifySlack(`⚠️ Agent error: ${error.message}`);
    await sentry.captureException(error);
  },
  
  // Called when agent stops
  onStop: async () => {
    console.log('🛑 Agent stopped');
    await notifySlack('Agent stopped');
  },
  
  // Called when balance is low
  onLowBalance: async (balance) => {
    console.warn(`⚠️ Low balance: ${balance}`);
    await notifySlack(`🚨 Agent needs funding! Balance: ${balance}`);
  },
};
```

## AgentExecutionResult Interface

The `onExecution` hook receives a result object with the following structure:

```typescript
interface AgentExecutionResult {
  success: boolean;              // Whether execution succeeded
  action: string;                // 'buy', 'sell', 'launch', 'wait', 'discover'
  decision?: AgentDecision;      // AI decision details
  marketData?: any;              // Market data at execution time
  executionResult?: any;         // Transaction result (tx hash, amounts, etc.)
  error?: string;                // Error message if failed
  timestamp: number;             // Unix timestamp (ms)
  balanceBefore?: string;        // Balance before execution (atomic units)
  balanceAfter?: string;         // Balance after execution (atomic units)
}

interface AgentDecision {
  action: string;                // Action chosen by AI
  params: any;                   // Action parameters
  reasoning: string;             // AI's reasoning
  confidence: number;            // Confidence score (0-1)
}
```

## Integration Examples

### Save to Database (PostgreSQL)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const config: AgentConfig = {
  // ... other config
  
  onExecution: async (result) => {
    await prisma.agentExecution.create({
      data: {
        agentId: config.agentId,
        action: result.action,
        success: result.success,
        timestamp: new Date(result.timestamp),
        balanceBefore: result.balanceBefore || '0',
        balanceAfter: result.balanceAfter || '0',
        decision: result.decision as any,
        error: result.error,
      },
    });
  },
};
```

### Send to Datadog

```typescript
import { StatsD } from 'node-dogstatsd';

const statsd = new StatsD();

const config: AgentConfig = {
  // ... other config
  
  onExecution: async (result) => {
    // Increment execution counter
    statsd.increment('agent.execution', 1, {
      agent: config.agentId,
      action: result.action,
      success: result.success.toString(),
    });
    
    // Track balance
    const balance = Number(result.balanceAfter || 0) / 1e6;
    statsd.gauge('agent.balance', balance, {
      agent: config.agentId,
    });
  },
  
  onError: async (error) => {
    statsd.increment('agent.errors', 1, {
      agent: config.agentId,
    });
  },
};
```

### Send to Prometheus

```typescript
import { Counter, Gauge, register } from 'prom-client';

const executionCounter = new Counter({
  name: 'agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['agent', 'action', 'success'],
});

const balanceGauge = new Gauge({
  name: 'agent_balance_usdc',
  help: 'Agent USDC balance',
  labelNames: ['agent'],
});

const config: AgentConfig = {
  // ... other config
  
  onExecution: async (result) => {
    executionCounter.inc({
      agent: config.agentId,
      action: result.action,
      success: result.success.toString(),
    });
    
    const balance = Number(result.balanceAfter || 0) / 1e6;
    balanceGauge.set({ agent: config.agentId }, balance);
  },
};

// Expose metrics endpoint
import express from 'express';
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.listen(9090);
```

### Send to Slack

```typescript
async function notifySlack(message: string) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
}

const config: AgentConfig = {
  // ... other config
  
  onExecution: async (result) => {
    if (result.action === 'buy' || result.action === 'sell') {
      const emoji = result.success ? '✅' : '❌';
      const balance = (Number(result.balanceAfter || 0) / 1e6).toFixed(2);
      await notifySlack(
        `${emoji} Agent ${config.agentId} ${result.action} - Balance: ${balance} USDC`
      );
    }
  },
  
  onError: async (error) => {
    await notifySlack(`🚨 Agent ${config.agentId} error: ${error.message}`);
  },
  
  onLowBalance: async (balance) => {
    await notifySlack(`⚠️ Agent ${config.agentId} needs funding! Balance: ${balance}`);
  },
};
```

## Production Monitoring

For production deployments, use the **agent-execution-service** which provides:

### Prometheus Metrics

The backend exposes metrics at `/metrics`:

```
# Agent executions
agent_executions_total{agent="trader-001",action="buy",success="true"} 45

# Agent balance
agent_balance_usdc{agent="trader-001"} 1234.56

# Agent errors
agent_errors_total{agent="trader-001"} 2
```

### Grafana Dashboards

Create dashboards to visualize:
- Execution success rate
- Balance over time
- Actions per hour
- Error rate
- Trade profitability

### Database Logging

All executions are stored in Postgres:

```sql
-- View recent executions
SELECT * FROM agent_executions
WHERE agent_id = 'trader-001'
ORDER BY timestamp DESC
LIMIT 10;

-- Calculate success rate
SELECT
  agent_id,
  COUNT(*) as total_executions,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM agent_executions
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY agent_id;
```

### WebSocket Updates

The agent-execution-service streams real-time updates to your frontend:

```typescript
import io from 'socket.io-client';

const socket = io('wss://agents.x402agentpad.io');

socket.on('agent-execution', (data) => {
  console.log('Agent execution:', data);
  // Update UI in real-time
});

socket.on('agent-status', (data) => {
  console.log('Agent status changed:', data);
});
```

## Best Practices

1. **Always use lifecycle hooks** - Even if just for console logging
2. **Track balance changes** - Essential for detecting issues
3. **Monitor error rates** - Set up alerts for unusual error spikes
4. **Log AI reasoning** - Helps understand agent behavior
5. **Set up alerts** - Be notified of errors and low balance
6. **Keep historical data** - Useful for backtesting strategies
7. **Monitor execution costs** - Track x402 fees and gas costs

## Troubleshooting

### Agent not executing

Check:
- `reviewIntervalMs` - Is it set correctly?
- Working hours - Is the agent within working hours?
- Balance - Does the agent have sufficient USDC?
- Errors - Check the `onError` hook for error messages

### High error rate

Common causes:
- Insufficient balance (USDC or ETH)
- Network issues (RPC rate limits)
- Contract reverts (slippage, amount too small)
- Expired signatures (for self-execute mode)

### Unexpected actions

Check:
- AI reasoning in `decision.reasoning`
- Market data at execution time
- Position limits and balance constraints
- Initial prompt clarity

## See Also

- [Agent Configuration](./guides.md#agent-configuration)
- [Execution Modes](https://github.com/GenesisTechAT/x402-agentpad/blob/main/README.md#execution-modes)
- [Examples](https://github.com/GenesisTechAT/x402-agentpad/tree/main/examples)

