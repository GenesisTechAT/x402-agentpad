/**
 * Main SDK Client
 *
 * Production-ready client for interacting with x402-Launch platform.
 * Handles x402 payments automatically, includes retry logic, and provides
 * type-safe methods for all platform operations.
 */

import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { ethers } from "ethers";
import {
  ClientConfig,
  LaunchTokenParams,
  LaunchTokenResponse,
  BuyTokensParams,
  BuyTokensResponse,
  SellTokensParams,
  SellTokensResponse,
  TokenInfo,
  QuoteParams,
  BuyQuote,
  SellQuote,
  RegisterAgentParams,
  AgentRegistrationResponse,
  HostedAgentStatus,
  HostedAgentControlResponse,
  ExecutionMode,
  SelfExecuteBuyResponse,
  SelfExecuteSellResponse,
} from "./types";
import {
  X402LaunchError,
  PaymentRequiredError,
  RateLimitError,
  NetworkError,
} from "./errors";
import {
  createX402PaymentHeader,
  extractPaymentRequirements,
  X402PaymentConfig,
} from "./payment";

// USDC addresses by chain ID
const USDC_ADDRESSES: Record<number, string> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
};

export class X402LaunchClient {
  private api: AxiosInstance;
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private chainId: number;
  private network: string;
  private usdcAddress: string;
  private executionMode: ExecutionMode;

  constructor(config: ClientConfig) {
    // Default values - users only need to provide private key
    const baseUrl = config.baseUrl || "https://api.launch.x402agentpad.io";

    this.wallet = new ethers.Wallet(config.wallet.privateKey);

    // Initialize provider from RPC URL or use default
    const rpcUrl = config.rpcUrl || "https://sepolia.base.org";
    this.chainId = config.chainId || 84532; // Base Sepolia default
    this.network = config.network || "base-sepolia";
    this.executionMode = config.executionMode || "gasless"; // Default to gasless

    // Get USDC address based on chain ID (hardcoded - we only support USDC)
    this.usdcAddress = USDC_ADDRESSES[this.chainId] || USDC_ADDRESSES[84532]; // Default to Base Sepolia

    const networkConfig = {
      name: this.network,
      chainId: this.chainId,
    };
    this.provider = new ethers.JsonRpcProvider(rpcUrl, networkConfig, {
      staticNetwork: true,
    });

    const apiPrefix = config.apiPrefix || "api/v1";

    this.api = axios.create({
      baseURL: `${baseUrl}/${apiPrefix}`,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000, // 60 second timeout
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response: any) => response,
      async (error: any) => {
        if (error.response?.status === 402) {
          // Payment required - extract requirements
          const paymentRequirements = extractPaymentRequirements(
            error.response.data
          );
          throw new PaymentRequiredError(
            error.response.data?.error || "Payment required",
            paymentRequirements || undefined
          );
        }

        if (error.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          throw new RateLimitError(
            "Rate limit exceeded",
            retryAfter ? parseInt(retryAfter) : undefined
          );
        }

        if (!error.response) {
          throw new NetworkError(
            "Network error - please check your connection"
          );
        }

        // Handle 404 specifically - API endpoint not found
        if (error.response.status === 404) {
          const baseUrl = error.config?.baseURL || "unknown";
          const endpoint = error.config?.url || "unknown";
          const fullUrl = endpoint.startsWith("http")
            ? endpoint
            : `${baseUrl}${endpoint}`;
          throw new X402LaunchError(
            `API endpoint not found (404): ${fullUrl}. Check if the endpoint '${endpoint}' exists or if the base URL '${baseUrl}' is correct.`,
            "API_NOT_FOUND"
          );
        }

        throw new X402LaunchError(
          error.response.data?.message ||
            error.message ||
            `HTTP ${error.response.status}: ${error.response.statusText}`,
          error.response.data?.code || String(error.response.status)
        );
      }
    );
  }

  /**
   * Make a request with automatic x402 payment handling
   */
  private async requestWithPayment<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    data?: any,
    retries = 3
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      method,
      url: endpoint,
      data,
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.api.request<T>(config);
        return response.data;
      } catch (error: any) {
        // Handle payment required - check both instance and name (for error propagation)
        const isPaymentError =
          error instanceof PaymentRequiredError ||
          error.name === "PaymentRequiredError" ||
          (error.response?.status === 402 && !config.headers?.["X-PAYMENT"]);

        if (isPaymentError && error.paymentDetails) {
          const requirements = error.paymentDetails;

          // Only retry once for payment (don't loop)
          if (attempt === 0 && !config.headers?.["X-PAYMENT"]) {
            // Determine asset: for sell operations, use token address; for buy operations, use USDC
            // The backend sets requirements.asset to the token address for sell, USDC for buy
            const asset = requirements.asset || this.usdcAddress;

            // Create payment header
            // Use extra.name/extra.version from backend if available (ensures exact match)
            // Fallback to querying contract if not provided
            const paymentHeader = await createX402PaymentHeader(this.wallet, {
              amount: requirements.maxAmountRequired,
              recipient: requirements.payTo,
              asset: asset, // Use asset from requirements (token for sell, USDC for buy)
              chainId: this.chainId,
              provider: this.provider,
              // Use backend-provided name/version if available (from extra field)
              // This ensures the signature matches exactly what the backend expects
              name: requirements.extra?.name,
              version: requirements.extra?.version,
            });

            // Retry with payment header
            config.headers = {
              ...config.headers,
              "X-PAYMENT": paymentHeader,
            };

            // Retry the request (continue loop to attempt retry)
            continue;
          } else {
            // Already tried payment or payment header exists - payment verification failed
            if (config.headers?.["X-PAYMENT"]) {
              // Payment was sent but still got 402 - verification failed
              const assetType =
                requirements?.asset === this.usdcAddress ? "USDC" : "tokens";
              throw new X402LaunchError(
                `Payment verification failed: ${
                  error.message || "Payment was rejected"
                }. Check your ${assetType} balance (required: ${
                  requirements?.maxAmountRequired || "unknown"
                }).`,
                "PAYMENT_VERIFICATION_FAILED"
              );
            }
            // No payment details available
            throw error;
          }
        }

        // Handle rate limiting with exponential backoff
        if (error instanceof RateLimitError && attempt < retries) {
          const delay = error.retryAfter
            ? error.retryAfter * 1000
            : Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise<void>((resolve) =>
            setTimeout(() => resolve(), delay)
          );
          continue;
        }

        // Re-throw other errors
        throw error;
      }
    }

    throw new X402LaunchError("Request failed after retries");
  }

  /**
   * Launch a new token
   *
   * @param params Token launch parameters
   * @returns Token launch response with addresses and transaction hash
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const token = await client.launchToken({
   *   name: 'My Token',
   *   ticker: 'MTK',
   *   description: 'A token launched by my agent',
   *   image: 'https://example.com/token.png',
   * });
   * console.log(`Token launched: ${token.tokenAddress}`);
   * ```
   */
  async launchToken(params: LaunchTokenParams): Promise<LaunchTokenResponse> {
    // Ensure ticker is uppercase
    const ticker = params.ticker.toUpperCase();

    // Validate ticker format (letters and numbers allowed)
    if (!/^[A-Z0-9]{3,10}$/.test(ticker)) {
      throw new X402LaunchError(
        `Invalid ticker: ${ticker}. Must be 3-10 uppercase letters or numbers.`,
        "INVALID_TICKER"
      );
    }

    // Default initial supply to 10M tokens (10,000,000 * 10^18)
    const initialSupply = params.initialSupply || "10000000000000000000000000";

    // Build request payload matching API requirements
    const payload: any = {
      name: params.name,
      ticker: ticker,
      description: params.description,
      image: params.image,
      initialSupply: initialSupply,
    };

    // Add optional fields if provided
    if (params.website) payload.website = params.website;
    if (params.twitter) payload.twitter = params.twitter;
    if (params.telegram) payload.telegram = params.telegram;
    if (params.discord) payload.discord = params.discord;

    return this.requestWithPayment<LaunchTokenResponse>(
      "POST",
      "/tokens/launch",
      payload
    );
  }

  /**
   * Buy tokens via bonding curve
   *
   * @param params Buy parameters (token address and USDC amount)
   * @returns Buy response with transaction details
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.buyTokens({
   *   tokenAddress: '0x...',
   *   usdcAmount: '1000000', // 1 USDC
   * });
   * console.log(`Bought ${result.tokenAmount} tokens`);
   * ```
   */
  async buyTokens(params: BuyTokensParams): Promise<BuyTokensResponse> {
    return this.requestWithPayment<BuyTokensResponse>("POST", "/tokens/buy", {
      tokenAddress: params.tokenAddress,
      usdcAmount: params.usdcAmount,
    });
  }

  /**
   * Sell tokens via bonding curve
   *
   * @param params Sell parameters (token address and token amount)
   * @returns Sell response with transaction details
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.sellTokens({
   *   tokenAddress: '0x...',
   *   tokenAmount: '1000000000000000000', // 1 token (18 decimals)
   * });
   * console.log(`Received ${result.usdcReceived} USDC`);
   * ```
   *
   * @note If amount exceeds facilitator limit (999999999999999999), the SDK automatically
   *       splits the sell into multiple transactions to sell everything.
   */
  async sellTokens(params: SellTokensParams): Promise<SellTokensResponse> {
    // Minimum sellable amount - amounts smaller than this would return 0 USDC and revert
    // Set to 0.01 tokens (1e16 wei) to avoid bonding curve rounding to 0
    const MIN_SELL_AMOUNT = BigInt("10000000000000000"); // 0.01 tokens

    const requestedAmount = BigInt(params.tokenAmount);

    // Check if amount is too small to sell
    if (requestedAmount < MIN_SELL_AMOUNT) {
      throw new Error(
        `Amount too small to sell: ${params.tokenAmount} tokens (< 0.01 tokens). ` +
          `This amount would return 0 USDC. Minimum sellable amount: ${MIN_SELL_AMOUNT.toString()} wei (0.01 tokens).`
      );
    }

    // Generate EIP-3009 signature for token transfer
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past
    const validAfter = String(timestamp);
    const validBefore = String(timestamp + 300); // 5 minutes

    // Get token contract details for EIP-712 domain
    const tokenABI = [
      "function name() view returns (string)",
      "function version() view returns (string)",
    ];
    const tokenContract = new ethers.Contract(
      params.tokenAddress,
      tokenABI,
      this.provider
    );
    
    // Get token name (required for EIP-712 domain)
    let tokenName: string;
    try {
      tokenName = await tokenContract.name();
    } catch (error: any) {
      throw new Error(`Failed to get token name for ${params.tokenAddress}. The token contract may not exist or may not be a valid ERC20 token. Error: ${error.message}`);
    }
    
    let tokenVersion = "1";
    try {
      tokenVersion = await tokenContract.version();
    } catch {
      // Default to '1' if version() not available
    }

    // Create EIP-712 domain for the token
    const domain = {
      name: tokenName,
      version: tokenVersion,
      chainId: this.chainId,
      verifyingContract: params.tokenAddress,
    };

    // EIP-712 types for TransferWithAuthorization (EIP-3009)
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    // Get backend signer address (where tokens will be sent)
    const backendAddressResponse = await this.api.get<{ address: string }>(
      "/tokens/backend-address"
    );
    const backendAddress = backendAddressResponse.data.address;

    // Message to sign
    const message = {
      from: this.wallet.address,
      to: backendAddress,
      value: BigInt(params.tokenAmount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce,
    };

    // Sign using EIP-712 typed data
    const signature = await this.wallet.signTypedData(domain, types, message);

    console.log(`[SDK] Created EIP-3009 signature for sell:`);
    console.log(`   Token: ${tokenName} (v${tokenVersion})`);
    console.log(`   Amount: ${params.tokenAmount}`);
    console.log(
      `   ValidAfter: ${validAfter} (${new Date(
        parseInt(validAfter) * 1000
      ).toISOString()})`
    );
    console.log(
      `   ValidBefore: ${validBefore} (${new Date(
        parseInt(validBefore) * 1000
      ).toISOString()})`
    );
    console.log(
      `   Current time: ${Math.floor(
        Date.now() / 1000
      )} (${new Date().toISOString()})`
    );
    console.log(`   Nonce: ${nonce}`);
    console.log(`   Signature: ${signature.substring(0, 20)}...`);

    // Send sell request with EIP-3009 signature in body (no x402 payment)
    return this.api
      .post<SellTokensResponse>("/tokens/sell", {
        tokenAddress: params.tokenAddress,
        tokenAmount: params.tokenAmount,
        sellerAddress: this.wallet.address,
        validAfter,
        validBefore,
        nonce,
        signature,
      })
      .then((res: any) => res.data);
  }

  /**
   * Get token information
   *
   * @param tokenAddress Token contract address
   * @returns Token information
   *
   * @example
   * ```typescript
   * const info = await client.getTokenInfo('0x...');
   * console.log(`Token: ${info.name} (${info.ticker})`);
   * ```
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const response = await this.api.get<TokenInfo>(`/tokens/${tokenAddress}`);
    return response.data;
  }

  /**
   * Get buy quote (estimate)
   *
   * @param params Quote parameters
   * @returns Buy quote with estimated token amount
   *
   * @example
   * ```typescript
   * const quote = await client.getBuyQuote({
   *   tokenAddress: '0x...',
   *   usdcAmount: '1000000', // 1 USDC
   * });
   * console.log(`Estimated tokens: ${quote.estimatedTokenAmount}`);
   * ```
   */
  async getBuyQuote(
    params: QuoteParams & { usdcAmount: string }
  ): Promise<BuyQuote> {
    const queryParams = new URLSearchParams({
      usdcAmount: params.usdcAmount,
    });
    // Backend expects: GET /tokens/:tokenAddress/quote?usdcAmount=...
    const response = await this.api.get<BuyQuote>(
      `/tokens/${params.tokenAddress}/quote?${queryParams.toString()}`
    );
    return response.data;
  }

  /**
   * Get sell quote (estimate)
   *
   * @param params Quote parameters
   * @returns Sell quote with estimated USDC amount
   *
   * @example
   * ```typescript
   * const quote = await client.getSellQuote({
   *   tokenAddress: '0x...',
   *   tokenAmount: '1000000000000000000', // 1 token
   * });
   * console.log(`Estimated USDC: ${quote.estimatedUsdcAmount}`);
   * ```
   */
  async getSellQuote(
    params: QuoteParams & { tokenAmount: string }
  ): Promise<SellQuote> {
    const queryParams = new URLSearchParams({
      tokenAmount: params.tokenAmount,
    });
    // Backend expects: GET /tokens/:tokenAddress/sell/quote?tokenAmount=...
    // Note: Backend route is :tokenAddress/sell/quote (confirmed in controller)
    const response = await this.api.get<SellQuote>(
      `/tokens/${params.tokenAddress}/sell/quote?${queryParams.toString()}`
    );
    return response.data;
  }

  /**
   * Discover tokens
   *
   * @param options Query options (pagination, sorting)
   * @returns List of tokens with pagination info
   *
   * @example
   * ```typescript
   * const { tokens, total } = await client.discoverTokens({
   *   page: 1,
   *   limit: 10,
   *   sortBy: 'volume24h',
   *   sortOrder: 'desc',
   * });
   * ```
   */
  async discoverTokens(options?: {
    page?: number;
    limit?: number;
    sortBy?: "marketCap" | "volume24h" | "launchTime";
    sortOrder?: "asc" | "desc";
  }): Promise<{ tokens: TokenInfo[]; total: number; page: number }> {
    const response = await this.api.get<{
      tokens: TokenInfo[];
      total: number;
      page: number;
    }>("/tokens", { params: options });
    return response.data;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Register an agent for performance tracking and leaderboards
   *
   * This is useful for self-hosted agents that want to appear on the platform's
   * leaderboards and performance metrics. Requires x402 payment of $0.10.
   *
   * @param params Agent registration parameters
   * @returns Registration response with agent details
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const registration = await client.registerAgent({
   *   agentId: 'my-ai-trader-001',
   *   name: 'My AI Trader',
   *   description: 'Advanced trading agent',
   *   website: 'https://myagent.com',
   *   imageUrl: 'https://myagent.com/logo.png',
   * });
   * console.log(`Agent registered: ${registration.agentId}`);
   * ```
   */
  async registerAgent(
    params: RegisterAgentParams
  ): Promise<AgentRegistrationResponse> {
    // Generate EIP-3009 signature for verification
    // The signature proves ownership of the wallet
    // Message format: agentId + wallet address + timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `x402-launch: Register agent\nAgent ID: ${params.agentId}\nWallet: ${this.wallet.address}\nTimestamp: ${timestamp}`;

    // Sign the message using standard Ethereum message signing
    const signature = await this.wallet.signMessage(message);

    const payload = {
      agentId: params.agentId,
      name: params.name,
      description: params.description,
      website: params.website,
      imageUrl: params.imageUrl,
      signature: signature,
    };

    return this.requestWithPayment<AgentRegistrationResponse>(
      "POST",
      "/agents/register",
      payload
    );
  }

  /**
   * Get status of a hosted agent
   *
   * @param agentId Agent identifier
   * @param ownerAddress Optional: Owner address for verification
   * @returns Agent status information
   * @throws {X402LaunchError} For errors
   *
   * @example
   * ```typescript
   * const status = await client.getHostedAgentStatus('agent-123');
   * console.log(`Agent status: ${status.status}`);
   * console.log(`Balance: ${status.usdcBalance} USDC`);
   * ```
   */
  async getHostedAgentStatus(
    agentId: string,
    ownerAddress?: string
  ): Promise<HostedAgentStatus> {
    const params: any = {};
    if (ownerAddress) {
      params.ownerAddress = ownerAddress;
    }
    const response = await this.api.get<HostedAgentStatus>(
      `/agents/host/${agentId}`,
      { params }
    );
    return response.data;
  }

  /**
   * Pause a hosted agent
   *
   * Pauses a running agent temporarily. The agent can be resumed later.
   * Requires x402 payment of $0.01.
   *
   * @param agentId Agent identifier
   * @returns Control response
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.pauseHostedAgent('agent-123');
   * console.log(result.message); // "Agent paused successfully"
   * ```
   */
  async pauseHostedAgent(agentId: string): Promise<HostedAgentControlResponse> {
    return this.requestWithPayment<HostedAgentControlResponse>(
      "POST",
      `/agents/host/${agentId}/pause`,
      {}
    );
  }

  /**
   * Resume a paused hosted agent
   *
   * Resumes a paused agent and triggers immediate execution.
   * Requires x402 payment of $0.01.
   *
   * @param agentId Agent identifier
   * @returns Control response
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.resumeHostedAgent('agent-123');
   * console.log(result.message); // "Agent resumed successfully"
   * ```
   */
  async resumeHostedAgent(
    agentId: string
  ): Promise<HostedAgentControlResponse> {
    return this.requestWithPayment<HostedAgentControlResponse>(
      "POST",
      `/agents/host/${agentId}/resume`,
      {}
    );
  }

  /**
   * Stop a hosted agent permanently
   *
   * Stops an agent permanently. This cannot be undone - the agent must be
   * re-purchased to run again. Requires x402 payment of $0.01.
   *
   * @param agentId Agent identifier
   * @returns Control response
   * @throws {PaymentRequiredError} If payment is required
   * @throws {X402LaunchError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.stopHostedAgent('agent-123');
   * console.log(result.message); // "Agent stopped successfully"
   * ```
   */
  async stopHostedAgent(agentId: string): Promise<HostedAgentControlResponse> {
    return this.requestWithPayment<HostedAgentControlResponse>(
      "POST",
      `/agents/host/${agentId}/stop`,
      {}
    );
  }

  /**
   * Get ETH balance of the wallet
   *
   * @returns ETH balance in wei
   *
   * @example
   * ```typescript
   * const balance = await client.getEthBalance();
   * console.log(`ETH balance: ${ethers.formatEther(balance)} ETH`);
   * ```
   */
  async getEthBalance(): Promise<bigint> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return BigInt(balance.toString());
  }

  /**
   * Check if wallet has enough ETH for self-execute mode
   * Checks if balance >= 0.001 ETH (enough for ~5-10 transactions on Base)
   *
   * @returns True if wallet has enough ETH
   */
  async hasEnoughEthForSelfExecute(): Promise<boolean> {
    const balance = await this.getEthBalance();
    const MIN_ETH = BigInt("1000000000000000"); // 0.001 ETH in wei
    return balance >= MIN_ETH;
  }

  /**
   * Get current execution mode
   *
   * @returns Current execution mode
   */
  getExecutionMode(): ExecutionMode {
    return this.executionMode;
  }

  /**
   * Set execution mode
   *
   * @param mode Execution mode to use
   */
  setExecutionMode(mode: ExecutionMode): void {
    this.executionMode = mode;
  }

  /**
   * Buy tokens using self-execute mode (Economy)
   * Returns a signed transaction for the agent to execute
   * Requires x402 payment of 0.01 USDC (testnet pricing)
   *
   * @param params Buy parameters
   * @returns Signature and parameters to execute the transaction
   * @throws {PaymentRequiredError} If x402 payment is required
   * @throws {X402LaunchError} For other errors
   */
  async buyTokensSelfExecute(
    params: BuyTokensParams
  ): Promise<SelfExecuteBuyResponse> {
    return this.requestWithPayment<SelfExecuteBuyResponse>(
      "POST",
      "/tokens/buy/self-execute",
      {
        tokenAddress: params.tokenAddress,
        usdcAmount: params.usdcAmount,
      }
    );
  }

  /**
   * Sell tokens using self-execute mode (Economy)
   * Returns a signed transaction for the agent to execute
   * Requires x402 payment of 0.01 USDC (testnet pricing)
   *
   * @param params Sell parameters
   * @returns Signature and parameters to execute the transaction
   * @throws {PaymentRequiredError} If x402 payment is required
   * @throws {X402LaunchError} For other errors
   */
  async sellTokensSelfExecute(
    params: SellTokensParams
  ): Promise<SelfExecuteSellResponse> {
    return this.requestWithPayment<SelfExecuteSellResponse>(
      "POST",
      "/tokens/sell/self-execute",
      {
        tokenAddress: params.tokenAddress,
        tokenAmount: params.tokenAmount,
      }
    );
  }

  /**
   * Execute a buy transaction using backend signature (self-execute mode)
   * Agent pays gas, backend already verified payment
   *
   * @param signedData Signed transaction data from buyTokensSelfExecute
   * @returns Transaction hash
   * @throws {X402LaunchError} If transaction fails or signature expired
   */
  async executeBuyTransaction(
    signedData: SelfExecuteBuyResponse
  ): Promise<string> {
    // SECURITY: Validate signature hasn't expired
    const now = Math.floor(Date.now() / 1000);
    if (now > signedData.expiry) {
      throw new X402LaunchError(
        `Transaction signature expired. Expiry: ${signedData.expiry}, Current: ${now}`,
        "SIGNATURE_EXPIRED"
      );
    }

    // SECURITY: Validate buyer address matches our wallet
    if (
      signedData.buyerAddress.toLowerCase() !==
      this.wallet.address.toLowerCase()
    ) {
      throw new X402LaunchError(
        `Buyer address mismatch. Signature is for ${signedData.buyerAddress}, but wallet is ${this.wallet.address}`,
        "ADDRESS_MISMATCH"
      );
    }

    // Step 1: Approve USDC to bonding curve (if not already approved)
    const usdcAbi = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ];

    const usdcContract = new ethers.Contract(
      this.usdcAddress,
      usdcAbi,
      this.wallet.connect(this.provider)
    );

    // Check current allowance
    const currentAllowance = await usdcContract.allowance(
      this.wallet.address,
      signedData.bondingCurveAddress
    );

    // Approve if needed
    if (currentAllowance < BigInt(signedData.usdcAmount)) {
      console.log(
        `[SDK] Approving ${signedData.usdcAmount} USDC to bonding curve...`
      );
      const approveTx = await usdcContract.approve(
        signedData.bondingCurveAddress,
        signedData.usdcAmount
      );
      const approveReceipt = await approveTx.wait();

      if (!approveReceipt || approveReceipt.status !== 1) {
        throw new X402LaunchError(
          `USDC approval transaction failed`,
          "APPROVAL_FAILED"
        );
      }

      console.log(
        `[SDK] ✅ Approval transaction confirmed in block ${approveReceipt.blockNumber}`
      );

      // Verify allowance with retry logic (RPC nodes may have state sync delay)
      let newAllowance = BigInt(0);
      const maxRetries = 3;
      const retryDelays = [500, 1000, 2000]; // 0.5s, 1s, 2s
      let attempt = 0;

      while (
        attempt < maxRetries &&
        newAllowance < BigInt(signedData.usdcAmount)
      ) {
        attempt++;

        // First check immediately, then wait with delays
        if (attempt > 1) {
          const delay = retryDelays[attempt - 2];
          console.log(`[SDK] Waiting ${delay}ms for RPC state to sync...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        newAllowance = await usdcContract.allowance(
          this.wallet.address,
          signedData.bondingCurveAddress
        );
        console.log(
          `[SDK] Allowance check (${attempt}/${maxRetries}): ${newAllowance.toString()} (required: ${
            signedData.usdcAmount
          })`
        );

        if (newAllowance >= BigInt(signedData.usdcAmount)) {
          break; // Success!
        }
      }

      if (newAllowance < BigInt(signedData.usdcAmount)) {
        throw new X402LaunchError(
          `Approval failed: allowance is ${newAllowance}, needs ${signedData.usdcAmount}. Transaction confirmed but RPC state not updated after ${maxRetries} retries.`,
          "ALLOWANCE_VERIFICATION_FAILED"
        );
      }

      console.log(`[SDK] ✅ USDC approved and verified`);
    }

    // Step 2: Execute buy transaction
    const bondingCurveAbi = [
      "function buyTokensWithUSDC(uint256 usdcAmount, address buyer, address tokenAddress, bytes32 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) external returns (uint256)",
    ];

    const contract = new ethers.Contract(
      signedData.bondingCurveAddress,
      bondingCurveAbi,
      this.wallet.connect(this.provider)
    );

    // Split signature into v, r, s
    const signature = ethers.Signature.from(signedData.signature);

    // Execute transaction
    console.log(`[SDK] Executing buy transaction...`);
    const tx = await contract.buyTokensWithUSDC(
      signedData.usdcAmount,
      signedData.buyerAddress,
      signedData.tokenAddress,
      signedData.nonce,
      signedData.expiry,
      signature.v,
      signature.r,
      signature.s
    );

    await tx.wait();
    console.log(`[SDK] ✅ Buy transaction confirmed: ${tx.hash}`);
    return tx.hash;
  }

  /**
   * Execute a sell transaction using backend signature (self-execute mode)
   * Agent pays gas, backend already verified payment
   *
   * @param signedData Signed transaction data from sellTokensSelfExecute
   * @returns Transaction hash
   * @throws {X402LaunchError} If transaction fails or signature expired
   */
  async executeSellTransaction(
    signedData: SelfExecuteSellResponse
  ): Promise<string> {
    // SECURITY: Validate signature hasn't expired
    const now = Math.floor(Date.now() / 1000);
    if (now > signedData.expiry) {
      throw new X402LaunchError(
        `Transaction signature expired. Expiry: ${signedData.expiry}, Current: ${now}`,
        "SIGNATURE_EXPIRED"
      );
    }

    // SECURITY: Validate seller address matches our wallet
    if (
      signedData.sellerAddress.toLowerCase() !==
      this.wallet.address.toLowerCase()
    ) {
      throw new X402LaunchError(
        `Seller address mismatch. Signature is for ${signedData.sellerAddress}, but wallet is ${this.wallet.address}`,
        "ADDRESS_MISMATCH"
      );
    }

    // Step 1: Approve tokens to bonding curve (if not already approved)
    const tokenAbi = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ];

    const tokenContract = new ethers.Contract(
      signedData.tokenAddress,
      tokenAbi,
      this.wallet.connect(this.provider)
    );

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      this.wallet.address,
      signedData.bondingCurveAddress
    );

    // Approve if needed
    if (currentAllowance < BigInt(signedData.tokenAmount)) {
      console.log(
        `[SDK] Approving ${signedData.tokenAmount} tokens to bonding curve...`
      );
      const approveTx = await tokenContract.approve(
        signedData.bondingCurveAddress,
        signedData.tokenAmount
      );
      const approveReceipt = await approveTx.wait();

      if (!approveReceipt || approveReceipt.status !== 1) {
        throw new X402LaunchError(
          `Token approval transaction failed`,
          "APPROVAL_FAILED"
        );
      }

      console.log(
        `[SDK] ✅ Approval transaction confirmed in block ${approveReceipt.blockNumber}`
      );

      // Verify allowance with retry logic (RPC nodes may have state sync delay)
      let newAllowance = BigInt(0);
      const maxRetries = 3;
      const retryDelays = [500, 1000, 2000]; // 0.5s, 1s, 2s
      let attempt = 0;

      while (
        attempt < maxRetries &&
        newAllowance < BigInt(signedData.tokenAmount)
      ) {
        attempt++;

        // First check immediately, then wait with delays
        if (attempt > 1) {
          const delay = retryDelays[attempt - 2];
          console.log(`[SDK] Waiting ${delay}ms for RPC state to sync...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        newAllowance = await tokenContract.allowance(
          this.wallet.address,
          signedData.bondingCurveAddress
        );
        console.log(
          `[SDK] Allowance check (${attempt}/${maxRetries}): ${newAllowance.toString()} (required: ${
            signedData.tokenAmount
          })`
        );

        if (newAllowance >= BigInt(signedData.tokenAmount)) {
          break; // Success!
        }
      }

      if (newAllowance < BigInt(signedData.tokenAmount)) {
        throw new X402LaunchError(
          `Approval failed: allowance is ${newAllowance}, needs ${signedData.tokenAmount}. Transaction confirmed but RPC state not updated after ${maxRetries} retries.`,
          "ALLOWANCE_VERIFICATION_FAILED"
        );
      }

      console.log(`[SDK] ✅ Tokens approved and verified`);
    }

    // Step 2: Execute sell transaction
    const bondingCurveAbi = [
      "function sellTokensForUSDC(uint256 tokenAmount, address seller, address tokenAddress, bytes32 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) external returns (uint256)",
    ];

    const contract = new ethers.Contract(
      signedData.bondingCurveAddress,
      bondingCurveAbi,
      this.wallet.connect(this.provider)
    );

    // Split signature into v, r, s
    const signature = ethers.Signature.from(signedData.signature);

    // Execute transaction
    console.log(`[SDK] Executing sell transaction...`);
    const tx = await contract.sellTokensForUSDC(
      signedData.tokenAmount,
      signedData.sellerAddress,
      signedData.tokenAddress,
      signedData.nonce,
      signedData.expiry,
      signature.v,
      signature.r,
      signature.s
    );

    await tx.wait();
    console.log(`[SDK] ✅ Sell transaction confirmed: ${tx.hash}`);
    return tx.hash;
  }
}
