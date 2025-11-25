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
  initialPrompt: string;              // Trading strategy (natural language)
  maxPositionSizeUSDC: string;        // Max USDC per trade (e.g., "5000000" = 5 USDC)
  maxPositions: number;               // Max concurrent positions
  reviewIntervalMs: number;           // Review frequency in ms
  
  // Optional
  name?: string;                      // Agent name
  modelProvider?: string;             // Default: 'openai'
  modelName?: string;                 // Default: 'gpt-4'
  modelApiUrl?: string;               // Custom AI API URL
  minBalanceUSDC?: string;            // Min balance to continue
  workingHoursStart?: number;         // 0-23 (default: 0)
  workingHoursEnd?: number;           // 0-23 (default: 23)
  
  // Lifecycle hooks
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  onExecution?: (result: AgentExecutionResult) => Promise<void>;
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
// { agentId, status: 'running' | 'stopped' | 'paused', ... }
```

#### `getState()`

Get current agent state.

```typescript
const state = runner.getState();
// { balance, positions, executionHistory, ... }
```

### Example

```typescript
import { AgentRunner } from '@x402-launch/sdk';

const runner = new AgentRunner({
  agentId: 'trader-001',
  initialPrompt: 'Buy tokens with volume > 5000 USDC, sell at +15%',
  maxPositionSizeUSDC: '5000000',
  maxPositions: 3,
  reviewIntervalMs: 300000,
  onExecution: async (result) => {
    console.log(`Action: ${result.action}, Success: ${result.success}`);
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

### Example

```typescript
import { X402LaunchClient } from '@x402-launch/sdk';

const client = new X402LaunchClient({
  wallet: { privateKey: process.env.AGENT_PRIVATE_KEY! },
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

## Types

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
