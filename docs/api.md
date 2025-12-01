# API Reference

## AgentRunner

Build autonomous trading agents that make decisions using AI.

### Constructor

```typescript
new AgentRunner(config: AgentConfig, privateKey: string, clientConfig?: ClientConfig)
```

**Parameters:**
- `config` - Agent configuration (see below)
- `privateKey` - Wallet private key (string)
- `clientConfig` - Optional client configuration

### AgentConfig

```typescript
interface AgentConfig {
  agentId: string;                    // Unique agent ID
  name?: string;                      // Agent display name
  initialPrompt: string;              // Trading strategy (natural language)
  maxPositionSizeUSDC: string;        // Max USDC per trade (e.g., "5000000" = 5 USDC)
  maxPositions: number;               // Max concurrent positions
  reviewIntervalMs: number;           // Review frequency in ms
  
  // AI Model (Optional - uses x402 AI service by default)
  modelProvider?: 'x402';             // Uses x402 AI service (recommended)
  modelName?: string;                 // e.g., 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'
  modelApiUrl?: string;               // Custom AI API URL
  
  // Risk Management (Optional)
  minBalanceUSDC?: string;            // Min balance to continue
  workingHoursStart?: number;         // 0-23 (default: 0)
  workingHoursEnd?: number;           // 0-23 (default: 23)
  
  // Execution mode
  executionMode?: 'auto' | 'gasless' | 'self-execute';  // Default: 'auto'
  
  // Lifecycle hooks
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  onExecution?: (result: AgentExecutionResult) => Promise<void>;
  onPhaseChange?: (phase: ExecutionPhase, details?: string) => Promise<void>;
}
```

### Methods

#### `start()`

Start the agent execution loop.

```typescript
await runner.start();
```

#### `stop()`

Stop the agent.

```typescript
await runner.stop();
```

#### `pause()`

Pause the agent temporarily.

```typescript
await runner.pause();
```

#### `resume()`

Resume a paused agent.

```typescript
await runner.resume();
```

#### `getStatus()`

Get current agent status.

```typescript
const status = runner.getStatus();
// { agentId, status, currentPhase, phaseDetails, ... }
```

#### `getState()`

Get current agent state.

```typescript
const state = runner.getState();
// { balance, positions, executionHistory, ... }
```

#### `getCurrentPhase()`

Get current execution phase.

```typescript
const phase = runner.getCurrentPhase();
// 'fetching_market' | 'calling_ai' | 'executing_action' | 'waiting' | etc.
```

#### `setInitialExecutionHistory(history)`

Load execution history from database (for agent memory after restart).

```typescript
runner.setInitialExecutionHistory(recentExecutions);
```

### Example

```typescript
import { AgentRunner } from '@genesis-tech/x402-agentpad-sdk';

const runner = new AgentRunner({
  agentId: 'trader-001',
  initialPrompt: 'Buy tokens with volume > 5000 USDC, sell at +15%',
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
  reviewIntervalMs: 300000,
  modelName: 'openai/gpt-4o-mini',
  onExecution: async (result) => {
    console.log(`Action: ${result.action}, Success: ${result.success}`);
  },
  onPhaseChange: async (phase, details) => {
    console.log(`Phase: ${phase} - ${details}`);
  },
}, process.env.AGENT_PRIVATE_KEY!);

await runner.start();
```

---

## X402LaunchClient

Manual trading API for direct control.

### Constructor

```typescript
new X402LaunchClient(config: ClientConfig)
```

**Parameters:**
- `config.wallet.privateKey` - Wallet private key (required)
- `config.baseUrl` - API URL (optional)
- `config.chainId` - Chain ID (optional, default: 84532)
- `config.rpcUrl` - RPC URL (optional)
- `config.executionMode` - 'auto' | 'gasless' | 'self-execute' (optional)

### Methods

#### `discoverTokens(params)`

Discover tokens on the platform.

```typescript
const result = await client.discoverTokens({
  page: 1,
  limit: 10,
  sortBy: 'volume24h',
  sortOrder: 'desc',
});
```

**Returns:** `{ tokens: TokenInfo[], total: number }`

#### `getTokenInfo(address)`

Get detailed token information.

```typescript
const token = await client.getTokenInfo('0x...');
```

**Returns:** `TokenInfo`

#### `buyTokens(params)`

Buy tokens with USDC.

```typescript
const result = await client.buyTokens({
  tokenAddress: '0x...',
  usdcAmount: '5000000',  // 5 USDC (6 decimals)
});
```

**Returns:** `{ transactionHash, tokenAmount, usdcPaid }`

#### `sellTokens(params)`

Sell tokens for USDC.

```typescript
const result = await client.sellTokens({
  tokenAddress: '0x...',
  tokenAmount: '1000000000000000000',  // 1 token (18 decimals)
});
```

**Returns:** `{ transactionHash, tokenAmount, usdcReceived }`

#### `launchToken(params)`

Launch a new token.

```typescript
const result = await client.launchToken({
  name: 'My Token',
  ticker: 'MTK',
  description: 'My awesome token',
  image: 'https://example.com/image.png',
});
```

**Returns:** `{ tokenAddress, transactionHash }`

#### `getWalletAddress()`

Get the wallet address.

```typescript
const address = client.getWalletAddress();
```

**Returns:** `string`

#### `getBalance()`

Get USDC balance.

```typescript
const balance = await client.getBalance();
```

**Returns:** `string` (USDC balance in 6 decimals)

### Example

```typescript
import { X402LaunchClient } from '@genesis-tech/x402-agentpad-sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
  executionMode: 'auto',
});

// Discover tokens
const { tokens } = await client.discoverTokens({ limit: 5 });

// Buy top token
if (tokens.length > 0) {
  await client.buyTokens({
    tokenAddress: tokens[0].address,
    usdcAmount: '5000000',
  });
}
```

---

## Strategy Templates

Use pre-built trading strategies:

```typescript
import { getStrategyTemplate, STRATEGY_TEMPLATE_LIST } from '@genesis-tech/x402-agentpad-sdk';

// Get a template
const template = getStrategyTemplate('token-launcher');

// Use in config
const config = {
  agentId: 'my-agent',
  ...template,
};

// List all templates
console.log(STRATEGY_TEMPLATE_LIST);
// ['conservative-holder', 'momentum-trader', 'dip-buyer', 'new-launch-hunter', 'token-launcher', ...]
```

---

## Types

### ExecutionPhase

```typescript
type ExecutionPhase = 
  | 'idle'              // Waiting for next cycle
  | 'queued'            // Job in queue
  | 'starting'          // Agent starting
  | 'fetching_market'   // Getting market data
  | 'building_prompt'   // Building AI prompt
  | 'calling_ai'        // Waiting for AI response
  | 'parsing_decision'  // Parsing AI decision
  | 'executing_action'  // Executing trade
  | 'recording_result'  // Saving result
  | 'waiting'           // Waiting for next interval
  | 'error'             // Error occurred
  | 'paused'            // Agent paused
  | 'stopped';          // Agent stopped
```

### TokenInfo

```typescript
interface TokenInfo {
  address: string;
  name: string;
  ticker: string;
  description: string;
  image: string;
  creator: string;
  createdAt: number;
  marketCap: string;
  volume24h: string;
  price: string;
  progress: number;        // 0-100
  holders: number;
}
```

### AgentExecutionResult

```typescript
interface AgentExecutionResult {
  success: boolean;
  action: string;
  decision: AgentDecision;
  executionResult?: any;
  error?: string;
  timestamp: number;
  balanceBefore?: string;
  balanceAfter?: string;
  modelLatencyMs?: number;
  executionTimeMs?: number;
}
```

### AgentStatus

```typescript
interface AgentStatus {
  agentId: string;
  status: 'running' | 'stopped' | 'paused' | 'error';
  isRunning: boolean;
  executionCount: number;
  balance?: string;
  lastExecution?: AgentExecutionResult;
  lastError?: Error;
  startedAt?: number;
  stoppedAt?: number;
  // Real-time phase tracking
  currentPhase?: ExecutionPhase;
  phaseDetails?: string;
  phaseChangedAt?: number;
}
```

---

## Networks

### Base Sepolia (Testnet)
- Chain ID: 84532
- RPC: https://sepolia.base.org
- USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

### Base Mainnet
- Chain ID: 8453
- RPC: https://mainnet.base.org
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
