/**
 * Type definitions for x402-Launch SDK
 */

/**
 * Transaction execution mode
 * - gasless: Backend pays gas, higher x402 fee (2 USDC for buy/sell)
 * - self-execute: Agent pays gas, lower x402 fee (0.5 USDC for buy/sell)
 */
export type ExecutionMode = 'gasless' | 'self-execute';

export interface ClientConfig {
  wallet: {
    privateKey: string;
  };
  // Optional: Override defaults if needed
  baseUrl?: string; // Default: 'https://api.launch.x402agentpad.io'
  apiPrefix?: string; // Default: 'api/v1'
  rpcUrl?: string; // RPC endpoint for blockchain queries (default: public RPC)
  chainId?: number; // Chain ID (default: 84532 for Base Sepolia)
  network?: string; // Network name (default: 'base-sepolia')
  executionMode?: ExecutionMode; // Default: 'gasless'
}

export interface LaunchTokenParams {
  name: string;
  ticker: string; // 3-10 uppercase letters (API uses 'ticker', not 'symbol')
  description: string; // 10-500 characters
  image: string; // Valid URL (required)
  initialSupply?: string; // Optional, defaults to 10M if not provided
  website?: string; // Optional
  twitter?: string; // Optional
  telegram?: string; // Optional
  discord?: string; // Optional
}

export interface LaunchTokenResponse {
  tokenAddress: string;
  bondingCurveAddress: string;
  transactionHash: string;
}

export interface BuyTokensParams {
  tokenAddress: string;
  usdcAmount: string; // In USDC atomic units (6 decimals)
}

export interface BuyTokensResponse {
  transactionHash: string;
  buyer: string;
  tokenAddress: string;
  tokenAmount: string;
  usdcPaid: string;
  averagePricePerToken: string;
  bondingCurveStatus: {
    tokensSold: string;
    totalUSDCRaised: string;
    currentPrice: string;
    progress: number;
  };
}

export interface SellTokensParams {
  tokenAddress: string;
  tokenAmount: string; // In token atomic units (18 decimals)
}

export interface SellTokensResponse {
  transactionHash: string;
  seller: string;
  tokenAddress: string;
  tokenAmount: string;
  usdcReceived: string;
  averagePricePerToken: string;
  bondingCurveStatus: {
    tokensSold: string;
    totalUSDCRaised: string;
    currentPrice: string;
    progress: number;
  };
}

export interface PriceMovement {
  change1m: number;
  change5m: number;
  change4h: number;
  change8h: number;
  change12h: number;
  change1d: number;
}

export interface PriceDataPoint {
  timestamp: number;
  price: string;
}

export interface VolumeDataPoint {
  timestamp: number;
  volume: string;
  tradeCount: number;
}

export interface RecentTrade {
  type: string;
  tokenAmount: string;
  usdcAmount: string;
  price: string;
  timestamp: number;
}

export interface TechnicalIndicators {
  ema20: string;
  ema50: string;
  volatility24h: number;
  high24h: string;
  low24h: string;
  range24h: string;
}

export interface TokenInfo {
  address: string;
  creator: string;
  name: string;
  ticker: string; // Symbol/ticker
  totalSupply: string;
  price: string; // Current price per token (in USDC)
  marketCap: string;
  volume24h: string;
  priceMovement: PriceMovement;
  progress: number;
  migrated: boolean;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  launchTime: number;
  // Enhanced data for AI trading (optional, may not always be present)
  priceHistory?: PriceDataPoint[];
  volumeHistory?: VolumeDataPoint[];
  recentTrades?: RecentTrade[];
  technicalIndicators?: TechnicalIndicators;
}

export interface QuoteParams {
  tokenAddress: string;
  usdcAmount?: string; // For buy quote
  tokenAmount?: string; // For sell quote
}

export interface BuyQuote {
  tokenAddress: string;
  usdcAmount: string;
  estimatedTokenAmount: string;
  currentPricePerToken: string;
  progress: number;
}

export interface SellQuote {
  tokenAddress: string;
  tokenAmount: string;
  estimatedUsdcAmount: string;
  currentPricePerToken: string;
  progress: number;
  note: string;
}

export interface RegisterAgentParams {
  agentId: string; // Unique identifier (3-50 chars)
  name: string; // Agent name (3-100 chars)
  description?: string; // Optional description (max 500 chars)
  website?: string; // Optional website URL
  imageUrl?: string; // Optional logo/image URL
}

export interface AgentRegistrationResponse {
  agentId: string;
  name: string;
  walletAddress: string;
  registeredAt: number;
  status: string;
}

export interface HostedAgentStatus {
  agentId: string;
  agentWallet: string;
  ownerAddress: string;
  status: 'active' | 'paused' | 'expired' | 'stopped' | 'low_balance';
  startedAt: string;
  expiresAt: string;
  remainingHours: number;
  usdcBalance: string;
  tradesExecuted: number;
  tokensLaunched: number;
  totalVolume: string;
  modelProvider: string;
  modelName: string;
  workingHoursStart: number;
  workingHoursEnd: number;
  maxPositionSizeUSDC: string;
  maxPositions: number;
  reviewIntervalMs: number;
  profitThresholdPercent: string;
}

export interface HostedAgentControlResponse {
  message: string;
}

/**
 * Self-execute buy response (Economy mode)
 * Contains signature and parameters for agent to execute transaction
 */
export interface SelfExecuteBuyResponse {
  signature: string;
  bondingCurveAddress: string;
  usdcAmount: string;
  buyerAddress: string;
  tokenAddress: string;
  nonce: string; // Unique nonce to prevent replay attacks
  expiry: number; // Unix timestamp when signature expires (10 min)
}

/**
 * Self-execute sell response (Economy mode)
 * Contains signature and parameters for agent to execute transaction
 */
export interface SelfExecuteSellResponse {
  signature: string;
  bondingCurveAddress: string;
  tokenAmount: string;
  sellerAddress: string;
  tokenAddress: string;
  nonce: string; // Unique nonce to prevent replay attacks
  expiry: number; // Unix timestamp when signature expires (10 min)
}

