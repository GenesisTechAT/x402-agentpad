/**
 * AI Model Provider with x402 Payment Support
 * 
 * Handles AI model calls with automatic x402 payment processing
 */

import { ethers } from 'ethers';
import { AgentConfig, IAIModelProvider } from './interfaces';
import { createX402PaymentHeader } from '../payment';

/**
 * X402 AI Model Provider
 * 
 * Makes AI model calls using x402 payment protocol
 * No API keys needed - payments handled automatically
 */
export class X402AIProvider implements IAIModelProvider {
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private chainId: number;
  private usdcAddress: string;

  constructor(
    wallet: ethers.Wallet,
    provider: ethers.Provider,
    chainId: number,
    usdcAddress: string
  ) {
    this.wallet = wallet;
    this.provider = provider;
    this.chainId = chainId;
    this.usdcAddress = usdcAddress;
  }

  /**
   * Call AI model with x402 payment handling
   */
  async callModel(prompt: string, config: AgentConfig): Promise<string> {
    const modelApiUrl = config.modelApiUrl || 'https://api.ai.x402agentpad.io/v1/chat';
    const modelName = config.modelName || 'gpt-3.5-turbo';
    const modelProvider = config.modelProvider || 'openai';

    // Build request payload
    const requestBody = {
      model: modelName,
      provider: modelProvider,
      messages: [
        {
          role: 'system',
          content: 'You are an autonomous trading agent. Always respond with valid JSON as specified in the prompt.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    };

    // Make initial request (may get 402 Payment Required)
    let response = await fetch(modelApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Handle 402 Payment Required
    if (response.status === 402) {
      const paymentDetails = await response.json() as any;

      if (!paymentDetails.accepts || paymentDetails.accepts.length === 0) {
        throw new Error('Payment required but no payment details provided');
      }

      const paymentInfo = paymentDetails.accepts[0] as any;

      // Create x402 payment header
      const paymentHeader = await createX402PaymentHeader(this.wallet, {
        amount: paymentInfo.maxAmountRequired,
        recipient: paymentInfo.payTo,
        asset: paymentInfo.asset || this.usdcAddress,
        chainId: this.chainId,
        provider: this.provider,
      });

      // Retry with payment
      response = await fetch(modelApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': paymentHeader,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as any;
      const errorMessage = error.error?.message || error.error || error.message || response.statusText;
      throw new Error(`AI Model API error: ${errorMessage}`);
    }

    const data = await response.json() as any;

    // Handle different response formats
    let responseText: string;
    if (data.content && typeof data.content === 'string') {
      responseText = data.content;
    } else if (data.choices && data.choices[0]?.message?.content) {
      // OpenAI format
      responseText = data.choices[0].message.content;
    } else if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
      // Anthropic format
      responseText = data.content[0].text;
    } else if (data.response || data.text) {
      // Generic format
      responseText = data.response || data.text;
    } else if (typeof data === 'string') {
      responseText = data;
    } else {
      // Log the actual response for debugging
      console.error('Unexpected response format:', JSON.stringify(data, null, 2));
      throw new Error(`Unexpected response format from AI model API: ${JSON.stringify(data).substring(0, 200)}`);
    }

    // Clean up the response - remove markdown code blocks if present
    // Some models wrap JSON in ```json ... ``` blocks
    responseText = responseText.trim();
    if (responseText.startsWith('```')) {
      // Remove markdown code block markers
      responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      responseText = responseText.trim();
    }

    return responseText;
  }

  /**
   * Build agent prompt with market data and configuration
   */
  buildPrompt(config: AgentConfig, marketData: any, currentBalance: string, launchedTokens: string[] = []): string {
    const tokensInfo = marketData.tokens?.slice(0, 10).map((t: any) => ({
      address: t.address,
      name: t.name,
      symbol: t.ticker,
      volume24h: t.volume24h,
      marketCap: t.marketCap,
      progress: t.progress,
      currentPrice: t.price,
    })) || [];

    const balanceUSDC = (Number(currentBalance) / 1e6).toFixed(2);
    const maxPositionUSDC = (Number(config.maxPositionSizeUSDC) / 1e6).toFixed(2);

    return `You are an autonomous trading agent operating on a token launchpad platform.

YOUR TRADING STRATEGY:
${config.initialPrompt}

CURRENT SITUATION:
- Available balance: ${balanceUSDC} USDC
- Maximum position size: ${maxPositionUSDC} USDC per position
- Maximum concurrent positions: ${config.maxPositions}
- Current positions: ${(marketData as any).currentPositions?.length || 0}/${config.maxPositions}
- Market tokens available: ${tokensInfo.length}

CURRENT MARKET DATA:
${JSON.stringify(tokensInfo, null, 2)}

${launchedTokens.length > 0 ? `RECENTLY LAUNCHED TOKENS (YOU LAUNCHED THESE):
${launchedTokens.map((addr, i) => {
      const token = tokensInfo.find((t: any) => t.address?.toLowerCase() === addr.toLowerCase());
      const hasPosition = (marketData as any).currentPositions?.some((p: any) => p.tokenAddress?.toLowerCase() === addr.toLowerCase());
      return `  ${i + 1}. ${token ? `${token.name} (${token.symbol})` : 'Token'} - ${addr}${hasPosition ? ' [YOU OWN THIS]' : ' [NOT OWNED - BUY IT]'}`;
    }).join('\n')}

IMPORTANT: 
- If you launched a token but DON'T own it yet, buy it now (once only)
- If you already own a launched token, focus on selling it when profitable (don't buy more)
- Don't buy the same token twice - check your current positions first
` : ''}

${(marketData as any).currentPositions?.length > 0 ? `CURRENT POSITIONS (YOU OWN THESE - CONSIDER SELLING):
${(marketData as any).currentPositions.map((p: any, i: number) => {
      const token = tokensInfo.find((t: any) => t.address?.toLowerCase() === p.tokenAddress?.toLowerCase());
      const holdMinutes = Math.floor(p.holdTimeMs / 60000);
      return `  ${i + 1}. ${token ? `${token.name} (${token.symbol})` : p.tokenAddress} - Invested: ${(Number(p.usdcInvested) / 1e6).toFixed(2)} USDC, Held: ${holdMinutes}m`;
    }).join('\n')}

PRIORITY: Review your positions and sell when profitable. Don't buy more tokens if you're at max positions.
` : ''}

AVAILABLE ACTIONS:
1. discover - Discover more tokens (params: {limit?: number, sortBy?: 'volume24h'|'marketCap'|'launchTime'})
2. analyze - Get detailed info about a token (params: {tokenAddress: string})
3. buy - Buy tokens (params: {tokenAddress: string, usdcAmount: string})
   Use decimal format: "0.5" for 0.5 USDC, "5.0" for 5 USDC, "10.25" for 10.25 USDC
4. sell - Sell tokens (params: {tokenAddress: string, tokenAmount: string})
   Use decimal format: "0.5" for 0.5 tokens, "1.0" for 1 token, "10.25" for 10.25 tokens
5. launch - Launch a new token (params: {name: string, ticker: string, description: string})
6. wait - Wait before next action (params: {reason: string})

CONSTRAINTS:
- Maximum position size: ${maxPositionUSDC} USDC
- Maximum concurrent positions: ${config.maxPositions}
- Current balance: ${balanceUSDC} USDC
- CRITICAL: You CANNOT buy more than your current balance (${balanceUSDC} USDC)
- CRITICAL: Use decimal format for amounts, e.g., "0.5", "5.0", "10.25"

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations outside the JSON.

Respond with ONLY a JSON object (no markdown formatting, no code blocks):
{
  "action": "buy|sell|launch|discover|analyze|wait",
  "params": { ... },
  "reasoning": "Clear explanation of why you chose this action",
  "confidence": 0.85
}

Example valid buy response (usdcAmount in decimal format):
{"action":"buy","params":{"tokenAddress":"0x...","usdcAmount":"5.0"},"reasoning":"Token shows strong volume","confidence":0.85}
Note: Use decimal format: "0.5", "5.0", "10.25"

Example valid launch response:
{"action":"launch","params":{"name":"My Token","ticker":"MTK","description":"A great token for trading"},"reasoning":"Launching new token","confidence":0.9}`;
  }

  /**
   * Parse AI response into AgentDecision
   */
  parseDecision(response: string): any {
    try {
      // Try to extract JSON from response
      // First, try to find JSON object boundaries (more robust)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[AI Provider] No JSON found in response:', response.substring(0, 200));
        return { action: 'wait', params: { reason: 'Invalid response format' }, reasoning: 'No JSON found in AI response' };
      }

      let jsonStr = jsonMatch[0];

      // Try to fix common JSON issues before parsing
      // Remove trailing commas before closing braces/brackets
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      // Try parsing
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError: any) {
        // If parsing fails, try to extract just the action field
        console.warn('[AI Provider] JSON parse error:', parseError.message);
        console.warn('[AI Provider] Attempted to parse:', jsonStr.substring(0, 300));

        // Try to extract action using regex as fallback
        const actionMatch = jsonStr.match(/"action"\s*:\s*"([^"]+)"/);
        const action = actionMatch ? actionMatch[1] : null;

        if (action && ['buy', 'sell', 'launch', 'discover', 'analyze', 'wait', 'stop'].includes(action)) {
          console.warn(`[AI Provider] Using fallback: extracted action "${action}" from malformed JSON`);
          return {
            action: action,
            params: {},
            reasoning: 'JSON parse error - using extracted action',
            confidence: 0.5,
          };
        }

        throw parseError; // Re-throw if we can't extract anything
      }

      // Validate action
      const validActions = ['buy', 'sell', 'launch', 'discover', 'analyze', 'wait', 'stop'];
      if (!validActions.includes(parsed.action)) {
        console.warn(`[AI Provider] Invalid action: ${parsed.action}`);
        return { action: 'wait', params: { reason: 'Invalid action' }, reasoning: `Invalid action: ${parsed.action}` };
      }

      return {
        action: parsed.action,
        params: parsed.params || {},
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error: any) {
      console.error('[AI Provider] Failed to parse decision:', error.message);
      console.error('[AI Provider] Response:', response.substring(0, 500));
      return { action: 'wait', params: { reason: 'Parse error' }, reasoning: `Parse error: ${error.message}` };
    }
  }
}

