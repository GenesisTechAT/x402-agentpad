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
    // Use OpenRouter model format (e.g., "openai/gpt-4o", "anthropic/claude-3-opus")
    // Default to a cost-effective model if not specified
    const modelName = config.modelName || 'openai/gpt-4o-mini';

    // Build request payload - no provider field needed, model name includes provider info
    // All models are routed through OpenRouter
    const requestBody = {
      model: modelName,
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
   * Uses advanced prompt engineering to ensure AI follows configured behavior
   */
  buildPrompt(
    config: AgentConfig, 
    marketData: any, 
    currentBalance: string, 
    launchedTokens: string[] = [],
    actionCooldowns: { [action: string]: string } = {}
  ): string {
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
    const currentPositions = (marketData as any).currentPositions || [];

    // Check if there are launched tokens that aren't owned (just for info, not forcing behavior)
    const hasUnownedLaunchedTokens = launchedTokens.some(addr => 
      !currentPositions.some((p: any) => p.tokenAddress?.toLowerCase() === addr.toLowerCase())
    );
    
    // Build action availability info and decision guidance
    const actionRules = this.buildActionRules(config, Number(balanceUSDC), currentPositions.length, tokensInfo.length, actionCooldowns, hasUnownedLaunchedTokens);
    const decisionFramework = this.buildDecisionFramework(config, Number(balanceUSDC), launchedTokens, actionCooldowns, hasUnownedLaunchedTokens);

    return `# YOUR STRATEGY (FOLLOW THIS)
${config.initialPrompt}

# CURRENT STATE
- Balance: ${balanceUSDC} USDC
- Positions: ${currentPositions.length}/${config.maxPositions}
- Max position size: ${maxPositionUSDC} USDC

# ACTION AVAILABILITY
${actionRules}

${currentPositions.length > 0 ? `# YOUR CURRENT POSITIONS (Review for SELL opportunities!)
${currentPositions.map((p: any, i: number) => {
      const token = tokensInfo.find((t: any) => t.address?.toLowerCase() === p.tokenAddress?.toLowerCase());
      const holdMins = Math.floor((p.holdTimeMs || 0) / 60000);
      const invested = Number(p.usdcInvested) / 1e6;
      const currentValue = token?.price ? (Number(p.tokenAmount) * Number(token.price)) : invested;
      const pnl = ((currentValue - invested) / invested * 100).toFixed(1);
      const pnlSign = parseFloat(pnl) >= 0 ? '+' : '';
      const sellSignal = parseFloat(pnl) >= 25 ? '🟢 TAKE PROFIT!' : (parseFloat(pnl) <= -10 ? '🔴 CUT LOSS!' : '');
      return `${i + 1}. ${token?.name || p.tokenAddress.slice(0,8)} - ${invested.toFixed(2)} USDC invested, ${pnlSign}${pnl}% P&L, held ${holdMins}min ${sellSignal}`;
    }).join('\n')}

SELL REMINDER: If any position shows 🟢 TAKE PROFIT or 🔴 CUT LOSS, consider SELLING!
` : ''}

${launchedTokens.length > 0 ? `# TOKENS YOU LAUNCHED
${launchedTokens.map((addr, i) => {
      const token = tokensInfo.find((t: any) => t.address?.toLowerCase() === addr.toLowerCase());
      const owned = currentPositions.some((p: any) => p.tokenAddress?.toLowerCase() === addr.toLowerCase());
      return `${i + 1}. ${token?.name || 'Token'} (${addr.slice(0,8)}...) - ${owned ? '✅ You own this' : '⚠️ You do NOT own this - BUY IT!'}`;
    }).join('\n')}

IMPORTANT: If you just launched a token but don't own it yet, your NEXT action should be BUY!
Even if launch is on cooldown, BUY is still available.
` : ''}

# MARKET DATA
${tokensInfo.length > 0 ? JSON.stringify(tokensInfo.slice(0, 5), null, 2) : 'No tokens available'}

# DECISION GUIDANCE
${decisionFramework}

# AVAILABLE ACTIONS
- launch: Create token {name, ticker, description} - costs ~0.01 USDC
- buy: Buy tokens {tokenAddress, usdcAmount} - use decimal format "5.0"
- sell: Sell tokens {tokenAddress, tokenAmount} - use decimal format "1.0"
- discover: Find tokens {limit?, sortBy?}
- analyze: Get token details {tokenAddress}
- wait: Skip this cycle {reason} - only if truly nothing to do

# RESPONSE (JSON ONLY)
{"action":"...","params":{...},"reasoning":"explain your decision based on your strategy","confidence":0.85}`;
  }

  /**
   * Build agent identity based on configuration
   */
  /**
   * Build action availability info (strategy-agnostic)
   */
  private buildActionRules(
    config: AgentConfig, 
    balance: number, 
    positions: number, 
    tokens: number,
    actionCooldowns: { [action: string]: string } = {},
    hasUnownedLaunchedTokens: boolean = false
  ): string {
    const priorities = config.actionPriorities || [];
    const enabledPriorities = priorities.filter(p => p.enabled !== false).sort((a, b) => a.priority - b.priority);
    const disabledActions = priorities.filter(p => p.enabled === false).map(p => p.action);
    
    let rules = '';
    
    // Show what's available vs blocked
    rules += `Available actions:\n`;
    
    const allActions: Array<'launch' | 'buy' | 'sell' | 'discover' | 'analyze' | 'wait'> = ['launch', 'buy', 'sell', 'discover', 'analyze', 'wait'];
    allActions.forEach(action => {
      if (disabledActions.includes(action)) {
        rules += `  ✗ ${action}: DISABLED in config\n`;
      } else if (actionCooldowns[action]) {
        rules += `  ⏰ ${action}: ${actionCooldowns[action]}\n`;
      } else {
        rules += `  ✓ ${action}: available\n`;
      }
    });
    
    // Show priority order if configured
    if (enabledPriorities.length > 0) {
      rules += `\nYour configured priorities: `;
      rules += enabledPriorities.map(p => `${p.action}(P${p.priority})`).join(' → ');
      rules += '\n';
    }
    
    return rules;
  }

  /**
   * Build decision guidance (strategy-agnostic)
   */
  private buildDecisionFramework(
    config: AgentConfig, 
    balance: number, 
    launchedTokens: string[],
    actionCooldowns: { [action: string]: string } = {},
    hasUnownedLaunchedTokens: boolean = false
  ): string {
    let framework = '';
    
    // Simple guidance based on what's blocked
    const blockedActions = Object.keys(actionCooldowns);
    
    if (blockedActions.length > 0) {
      framework += `Some actions are on cooldown. Choose from available actions based on your strategy.\n`;
    }
    
    // Gentle hint about launched tokens (not mandatory - let strategy decide)
    if (hasUnownedLaunchedTokens) {
      framework += `\nNote: You have launched tokens you don't own yet. Consider if your strategy requires buying them.\n`;
    }
    
    framework += `\nFollow YOUR STRATEGY above to decide what to do next.`;
    framework += `\nOnly use "wait" if your strategy says to wait or if no suitable action is available.`;
    
    return framework;
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

