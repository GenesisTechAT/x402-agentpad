/**
 * Robust RPC Provider with retry logic and fallbacks
 * Handles unreliable free RPCs gracefully
 */

import { ethers } from 'ethers';

// Free RPC endpoints for Base Sepolia (fallback order)
const BASE_SEPOLIA_RPCS = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.blockpi.network/v1/rpc/public',
  'https://rpc.notadegen.com/base/sepolia',
];

// Free RPC endpoints for Base Mainnet
const BASE_MAINNET_RPCS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.meowrpc.com',
];

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Robust JSON RPC Provider with automatic retry and fallback
 */
export class RobustProvider {
  private providers: ethers.JsonRpcProvider[] = [];
  private currentIndex: number = 0;
  private chainId: number;
  private retryConfig: RetryConfig;
  private rpcUrls: string[];

  constructor(
    rpcUrl?: string,
    chainId: number = 84532,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.chainId = chainId;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    // Build RPC list: user-provided first, then fallbacks
    const fallbacks = chainId === 8453 ? BASE_MAINNET_RPCS : BASE_SEPOLIA_RPCS;
    this.rpcUrls = rpcUrl ? [rpcUrl, ...fallbacks] : fallbacks;

    // Create providers for each RPC
    this.providers = this.rpcUrls.map(
      url => new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true })
    );

    console.log(`[RobustProvider] Initialized with ${this.providers.length} RPC endpoints`);
  }

  /**
   * Get the current active provider
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.providers[this.currentIndex];
  }

  /**
   * Switch to the next available RPC
   */
  private switchToNext(): boolean {
    const nextIndex = (this.currentIndex + 1) % this.providers.length;
    if (nextIndex === 0 && this.currentIndex !== 0) {
      // We've cycled through all providers
      return false;
    }
    console.log(`[RobustProvider] Switching from ${this.rpcUrls[this.currentIndex]} to ${this.rpcUrls[nextIndex]}`);
    this.currentIndex = nextIndex;
    return true;
  }

  /**
   * Execute an RPC call with retry logic and fallback
   */
  async call<T>(
    fn: (provider: ethers.JsonRpcProvider) => Promise<T>,
    operationName: string = 'RPC call'
  ): Promise<T> {
    let lastError: Error | null = null;
    let totalAttempts = 0;
    const maxTotalAttempts = this.retryConfig.maxRetries * this.providers.length;

    while (totalAttempts < maxTotalAttempts) {
      const provider = this.getProvider();
      
      for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
        totalAttempts++;
        
        try {
          const result = await fn(provider);
          return result;
        } catch (error: any) {
          lastError = error;
          const errorMessage = error.message || String(error);
          
          // Check if it's a rate limit or network error
          const isRateLimited = errorMessage.includes('429') || 
                               errorMessage.includes('rate') ||
                               errorMessage.includes('Too Many');
          const isNetworkError = errorMessage.includes('network') ||
                                errorMessage.includes('ETIMEDOUT') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('fetch failed') ||
                                errorMessage.includes('CONNECTION_ERROR');

          if (isRateLimited || isNetworkError) {
            const delay = getBackoffDelay(attempt, this.retryConfig);
            console.warn(
              `[RobustProvider] ${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries}): ${errorMessage.slice(0, 100)}. Retrying in ${delay}ms...`
            );
            await sleep(delay);
            continue;
          }

          // For other errors, throw immediately
          throw error;
        }
      }

      // All retries exhausted for this provider, try next one
      if (!this.switchToNext()) {
        break;
      }
    }

    // All providers and retries exhausted
    throw new Error(
      `${operationName} failed after ${totalAttempts} attempts across ${this.providers.length} RPCs. ` +
      `Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Get balance with retry
   */
  async getBalance(address: string): Promise<bigint> {
    return this.call(
      provider => provider.getBalance(address),
      `getBalance(${address.slice(0, 10)}...)`
    );
  }

  /**
   * Get block number with retry
   */
  async getBlockNumber(): Promise<number> {
    return this.call(
      provider => provider.getBlockNumber(),
      'getBlockNumber'
    );
  }

  /**
   * Send transaction with retry (only retries on network errors, not tx failures)
   */
  async sendTransaction(
    signedTx: string
  ): Promise<ethers.TransactionResponse> {
    return this.call(
      provider => provider.broadcastTransaction(signedTx),
      'sendTransaction'
    );
  }

  /**
   * Create a contract instance that uses this robust provider
   */
  getContract(
    address: string,
    abi: ethers.InterfaceAbi,
    signer?: ethers.Signer
  ): ethers.Contract {
    const provider = this.getProvider();
    return new ethers.Contract(
      address,
      abi,
      signer || provider
    );
  }
}

/**
 * Create a robust provider instance
 */
export function createRobustProvider(
  rpcUrl?: string,
  chainId?: number,
  retryConfig?: Partial<RetryConfig>
): RobustProvider {
  return new RobustProvider(rpcUrl, chainId, retryConfig);
}

