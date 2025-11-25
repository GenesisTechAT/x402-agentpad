/**
 * AgentPad Trading Tools
 * 
 * Tool definitions for autonomous trading agents.
 * 
 * @internal These are used internally by AgentRunner.
 */

import { z } from 'zod';
import { X402LaunchClient } from '../client';

export interface AgentPadTool {
  id: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (params: any) => Promise<any>;
}

/**
 * Create trading tools for agents
 * 
 * @internal
 */
export function createAgentPadTools(client: X402LaunchClient): AgentPadTool[] {
  return [
    // Discover tokens
    {
      id: 'discover_tokens',
      description: 'Discover tokens on the launchpad. Returns top tokens sorted by volume or market cap.',
      parameters: z.object({
        limit: z.number().optional().default(10).describe('Number of tokens to fetch (default: 10)'),
        sortBy: z.enum(['volume24h', 'marketCap', 'launchTime']).optional().default('volume24h'),
      }),
      execute: async ({ limit, sortBy }) => {
        const result = await client.discoverTokens({
          page: 1,
          limit: limit || 10,
          sortBy: sortBy || 'volume24h',
          sortOrder: 'desc',
        });
        return {
          success: true,
          tokens: result.tokens.map(t => ({
            address: t.address,
            name: t.name,
            symbol: t.ticker,
            volume24h: t.volume24h,
            marketCap: t.marketCap,
            progress: t.progress,
            price: t.price,
          })),
        };
      },
    },

    // Get token info
    {
      id: 'get_token_info',
      description: 'Get detailed information about a specific token by its address.',
      parameters: z.object({
        tokenAddress: z.string().describe('The token contract address (0x...)'),
      }),
      execute: async ({ tokenAddress }) => {
        const tokenInfo = await client.getTokenInfo(tokenAddress);
        return {
          success: true,
          token: {
            address: tokenInfo.address,
            name: tokenInfo.name,
            symbol: tokenInfo.ticker,
            volume24h: tokenInfo.volume24h,
            marketCap: tokenInfo.marketCap,
            progress: tokenInfo.progress,
            price: tokenInfo.price,
            description: tokenInfo.description,
          },
        };
      },
    },

    // Buy tokens
    {
      id: 'buy_tokens',
      description: 'Buy tokens with USDC. Specify amount as decimal USDC (e.g., "0.5" for half a USDC, "5.0" for 5 USDC).',
      parameters: z.object({
        tokenAddress: z.string().describe('The token contract address to buy'),
        usdcAmount: z.string().describe('Amount of USDC to spend (decimal format, e.g., "0.5", "5.0", "10.25")'),
      }),
      execute: async ({ tokenAddress, usdcAmount }) => {
        try {
          const result = await client.buyTokens({
            tokenAddress,
            usdcAmount,
          });
          return {
            success: true,
            transactionHash: result.transactionHash,
            tokenAmount: result.tokenAmount,
            usdcPaid: result.usdcPaid,
            message: `Successfully bought ${result.tokenAmount} tokens for ${result.usdcPaid} USDC`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    },

    // Sell tokens
    {
      id: 'sell_tokens',
      description: 'Sell tokens for USDC. Specify amount as decimal tokens (e.g., "0.5" for half a token, "1.0" for 1 token, "10.5" for 10.5 tokens).',
      parameters: z.object({
        tokenAddress: z.string().describe('The token contract address to sell'),
        tokenAmount: z.string().describe('Amount of tokens to sell (decimal format, e.g., "0.5", "1.0", "10.25")'),
      }),
      execute: async ({ tokenAddress, tokenAmount }) => {
        try {
          const result = await client.sellTokens({
            tokenAddress,
            tokenAmount,
          });
          return {
            success: true,
            transactionHash: result.transactionHash,
            usdcReceived: result.usdcReceived,
            tokenAmount: result.tokenAmount,
            message: `Successfully sold ${result.tokenAmount} tokens for ${result.usdcReceived} USDC`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    },

    // Launch token
    {
      id: 'launch_token',
      description: 'Launch a new token on the platform.',
      parameters: z.object({
        name: z.string().describe('Token name (e.g., "My Great Token")'),
        ticker: z.string().describe('Token ticker symbol (e.g., "MGT")'),
        description: z.string().describe('Token description'),
        image: z.string().optional().describe('Token image URL (optional)'),
      }),
      execute: async ({ name, ticker, description, image }) => {
        try {
          const result = await client.launchToken({
            name,
            ticker: ticker.toUpperCase(),
            description,
            image: image || `https://via.placeholder.com/400/000000/FFFFFF?text=${encodeURIComponent(ticker)}`,
          });
          return {
            success: true,
            tokenAddress: result.tokenAddress,
            transactionHash: result.transactionHash,
            message: `Successfully launched token ${ticker} at ${result.tokenAddress}`,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      },
    },

    // Check balance
    {
      id: 'check_balance',
      description: 'Check the agent wallet USDC balance',
      parameters: z.object({}),
      execute: async () => {
        const walletAddress = client.getWalletAddress();
        return {
          success: true,
          walletAddress,
          message: 'Balance check - retrieve from blockchain using USDC contract',
        };
      },
    },
  ];
}

/**
 * Create tools with custom configuration
 */
export interface ToolConfig {
  client: X402LaunchClient;
  /** Allow token launching (default: true) */
  allowLaunch?: boolean;
  /** Allow buying (default: true) */
  allowBuy?: boolean;
  /** Allow selling (default: true) */
  allowSell?: boolean;
}

/**
 * Create configured trading tools
 * 
 * @internal
 */
export function createConfiguredAgentPadTools(config: ToolConfig): AgentPadTool[] {
  const allTools = createAgentPadTools(config.client);

  // Filter tools based on configuration
  return allTools.filter(tool => {
    if (!config.allowLaunch && tool.id === 'launch_token') return false;
    if (!config.allowBuy && tool.id === 'buy_tokens') return false;
    if (!config.allowSell && tool.id === 'sell_tokens') return false;
    return true;
  });
}

