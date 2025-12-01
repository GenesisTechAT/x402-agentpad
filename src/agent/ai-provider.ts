/**
 * AI Model Provider with x402 Payment Support
 *
 * Handles AI model calls with automatic x402 payment processing
 */

import { ethers } from "ethers";
import { AgentConfig, IAIModelProvider } from "./interfaces";
import { createX402PaymentHeader } from "../payment";

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
    const modelApiUrl =
      config.modelApiUrl || "https://api.ai.x402agentpad.io/v1/chat";
    const modelName = config.modelName || "openai/gpt-4o-mini";

    const requestBody = {
      model: modelName,
      messages: [
        {
          role: "system",
          content:
            "You are an autonomous trading agent. Always respond with valid JSON as specified in the prompt.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    };

    // Make initial request (may get 402 Payment Required)
    let response = await this.fetchWithRetry(modelApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // Handle 402 Payment Required
    if (response.status === 402) {
      const paymentDetails = (await response.json()) as any;

      if (!paymentDetails.accepts || paymentDetails.accepts.length === 0) {
        throw new Error("Payment required but no payment details provided");
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
      response = await this.fetchWithRetry(modelApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": paymentHeader,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({ message: response.statusText }))) as any;
      const errorMessage =
        error.error?.message ||
        error.error ||
        error.message ||
        response.statusText;
      throw new Error(`AI Model API error: ${errorMessage}`);
    }

    const data = (await response.json()) as any;

    // Handle different response formats
    let responseText: string;
    if (data.content && typeof data.content === "string") {
      responseText = data.content;
    } else if (data.choices && data.choices[0]?.message?.content) {
      responseText = data.choices[0].message.content;
    } else if (
      data.content &&
      Array.isArray(data.content) &&
      data.content[0]?.text
    ) {
      responseText = data.content[0].text;
    } else if (data.response || data.text) {
      responseText = data.response || data.text;
    } else if (typeof data === "string") {
      responseText = data;
    } else {
      console.error(
        "Unexpected response format:",
        JSON.stringify(data, null, 2)
      );
      throw new Error(
        `Unexpected response format from AI model API: ${JSON.stringify(
          data
        ).substring(0, 200)}`
      );
    }

    // Clean up the response
    responseText = responseText.trim();
    if (responseText.startsWith("```")) {
      responseText = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      responseText = responseText.trim();
    }

    return responseText;
  }

  /**
   * Fetch with retry logic for transient network errors
   */
  private async fetchWithRetry(
    url: string,
    options: any,
    retries = 3,
    backoff = 1000
  ): Promise<Response> {
    try {
      return await fetch(url, options);
    } catch (error: any) {
      const isRetryable =
        error.cause?.code === "ENOTFOUND" ||
        error.cause?.code === "ECONNREFUSED" ||
        error.cause?.code === "ETIMEDOUT" ||
        error.message.includes("fetch failed") ||
        error.message.includes("network timeout");

      if (retries > 0 && isRetryable) {
        console.warn(
          `[AI Provider] Network error (${error.message}), retrying in ${backoff}ms... (${retries} retries left)`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
      }

      throw error;
    }
  }

  /**
   * Build agent prompt with market data and configuration
   */
  buildPrompt(
    config: AgentConfig,
    marketData: any,
    currentBalance: string,
    launchedTokens: string[] = [],
    _actionCooldowns: { [action: string]: string } = {}, // Kept for backward compatibility
    executionHistory: Array<{action: string; success: boolean; error?: string; reasoning?: string; timestamp: number}> = []
  ): string {
    const tokensInfo =
      marketData.tokens?.slice(0, 10).map((t: any) => ({
        address: t.address,
        name: t.name,
        symbol: t.ticker,
        volume24h: t.volume24h,
        marketCap: t.marketCap,
        progress: t.progress,
        currentPrice: t.price,
      })) || [];

    const fetchError = marketData.fetchError;
    const balanceUSDC = (Number(currentBalance) / 1e6).toFixed(2);
    const maxPositionUSDC = (Number(config.maxPositionSizeUSDC) / 1e6).toFixed(2);
    const currentPositions = (marketData as any).currentPositions || [];

    // Check if there are launched tokens that aren't owned
    const hasUnownedLaunchedTokens = launchedTokens.some(
      (addr) =>
        !currentPositions.some(
          (p: any) => p.tokenAddress?.toLowerCase() === addr.toLowerCase()
        )
    );

    const hasMarketData = tokensInfo.length > 0;
    const decisionGuidance = this.buildDecisionGuidance(
      Number(balanceUSDC),
      hasUnownedLaunchedTokens,
      hasMarketData,
      fetchError
    );

    return `# YOUR STRATEGY (FOLLOW THIS)
${config.initialPrompt}

# CURRENT STATE
- Balance: ${balanceUSDC} USDC
- Positions: ${currentPositions.length}/${config.maxPositions}
- Max position size: ${maxPositionUSDC} USDC

${
  currentPositions.length > 0
    ? `# YOUR CURRENT POSITIONS (Review for SELL opportunities!)
${currentPositions
  .map((p: any, i: number) => {
    const token = tokensInfo.find(
      (t: any) => t.address?.toLowerCase() === p.tokenAddress?.toLowerCase()
    );
    const holdMins = Math.floor((p.holdTimeMs || 0) / 60000);
    const invested = Number(p.usdcInvested) / 1e6;
    const currentValue = token?.price
      ? Number(p.tokenAmount) * Number(token.price)
      : invested;
    const pnl = (((currentValue - invested) / invested) * 100).toFixed(1);
    const pnlSign = parseFloat(pnl) >= 0 ? "+" : "";
    const sellSignal =
      parseFloat(pnl) >= 25
        ? "🟢 TAKE PROFIT!"
        : parseFloat(pnl) <= -10
        ? "🔴 CUT LOSS!"
        : "";
    return `${i + 1}. ${
      token?.name || p.tokenAddress.slice(0, 8)
    } - ${invested.toFixed(
      2
    )} USDC invested, ${pnlSign}${pnl}% P&L, held ${holdMins}min ${sellSignal}`;
  })
  .join("\n")}

SELL REMINDER: If any position shows 🟢 TAKE PROFIT or 🔴 CUT LOSS, consider SELLING!
`
    : ""
}

${
  launchedTokens.length > 0
    ? `# TOKENS YOU LAUNCHED
${launchedTokens
  .map((addr, i) => {
    const token = tokensInfo.find(
      (t: any) => t.address?.toLowerCase() === addr.toLowerCase()
    );
    const owned = currentPositions.some(
      (p: any) => p.tokenAddress?.toLowerCase() === addr.toLowerCase()
    );
    return `${i + 1}. ${token?.name || "Token"} (${addr.slice(0, 8)}...) - ${
      owned ? "✅ You own this" : "⚠️ You do NOT own this - BUY IT!"
    }`;
  })
  .join("\n")}

IMPORTANT: If you just launched a token but don't own it yet, your NEXT action should be BUY!
`
    : ""
}

# MARKET DATA
${
  fetchError
    ? `⚠️ ${fetchError}`
    : tokensInfo.length > 0
    ? JSON.stringify(tokensInfo.slice(0, 5), null, 2)
    : "No tokens currently available in market. If you can LAUNCH tokens, this is a perfect opportunity to create one!"
}

${executionHistory.length > 0 ? `# RECENT ACTIONS (Learn from these!)
${executionHistory.slice(-5).map((h, i) => {
  const timeAgo = Math.floor((Date.now() - h.timestamp) / 60000);
  const status = h.success ? '✅' : '❌';
  const errorInfo = h.error ? ` - ERROR: ${h.error}` : '';
  return `${i+1}. ${status} ${h.action.toUpperCase()} (${timeAgo}m ago)${errorInfo}`;
}).join('\n')}

⚠️ IMPORTANT: If an action failed with an error, DO NOT repeat the same mistake!
- If ticker validation failed, use ONLY 3-10 UPPERCASE LETTERS (no numbers, no special chars)
- If a buy/sell failed, check the error and adjust your approach
- Learn from failures and try different parameters
` : ''}

# DECISION GUIDANCE
${decisionGuidance}

# AVAILABLE ACTIONS
- launch: Create token {name, ticker, description} - costs ~0.01 USDC (testnet)
- buy: Buy tokens {tokenAddress, usdcAmount} - use decimal format "5.0"
- sell: Sell tokens {tokenAddress, tokenAmount} - use decimal format "1.0"
- discover: Find tokens {limit?, sortBy?}
- analyze: Get token details {tokenAddress}
- wait: Skip this cycle {reason} - only if truly nothing to do

# RESPONSE (JSON ONLY)
{"action":"...","params":{...},"reasoning":"explain your decision based on your strategy","confidence":0.85}`;
  }

  /**
   * Build decision guidance
   */
  private buildDecisionGuidance(
    balance: number,
    hasUnownedLaunchedTokens: boolean,
    hasMarketData: boolean,
    marketDataError?: string
  ): string {
    let guidance = "";

    // Handle empty/error market data
    if (!hasMarketData || marketDataError) {
      if (marketDataError) {
        guidance += `\n⚠️ MARKET DATA ISSUE: ${marketDataError}\n`;
      }
      
      guidance += `\n📊 NO TOKENS AVAILABLE - Here's what to do:\n`;
      
      if (balance >= 1) {
        guidance += `  🚀 LAUNCH: Empty market = PERFECT opportunity to LAUNCH a new token!\n`;
      }
      
      guidance += `  🔍 DISCOVER: Try discovering tokens to find new opportunities.\n`;
      guidance += `  ⏳ WAIT: Only if discover and launch are unavailable.\n`;
      guidance += `\n💡 TIP: Don't just wait! Try DISCOVER first to find tokens, or LAUNCH if available.\n`;
    } else {
      if (balance >= 1) {
        guidance += `\n💡 LAUNCH is available! If your strategy involves launching tokens, consider launching now.\n`;
      }
    }

    // Urgent hint about launched tokens
    if (hasUnownedLaunchedTokens) {
      guidance += `\n⚠️ IMPORTANT: You have launched tokens you don't own yet. Your strategy likely requires BUYING them immediately!\n`;
    }

    guidance += `\nFollow YOUR STRATEGY above to decide what to do next.`;
    guidance += `\n🚫 Only use "wait" if you truly have nothing productive to do.`;
    guidance += `\n✅ If you CAN take an action that matches your strategy, DO IT - don't wait!`;

    return guidance;
  }

  /**
   * Parse AI response into AgentDecision
   */
  parseDecision(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(
          "[AI Provider] No JSON found in response:",
          response.substring(0, 200)
        );
        return {
          action: "wait",
          params: { reason: "Invalid response format" },
          reasoning: "No JSON found in AI response",
        };
      }

      let jsonStr = jsonMatch[0];
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError: any) {
        console.warn("[AI Provider] JSON parse error:", parseError.message);

        const actionMatch = jsonStr.match(/"action"\s*:\s*"([^"]+)"/);
        const action = actionMatch ? actionMatch[1] : null;

        if (
          action &&
          ["buy", "sell", "launch", "discover", "analyze", "wait", "stop"].includes(action)
        ) {
          console.warn(
            `[AI Provider] Using fallback: extracted action "${action}" from malformed JSON`
          );
          return {
            action: action,
            params: {},
            reasoning: "JSON parse error - using extracted action",
            confidence: 0.5,
          };
        }

        throw parseError;
      }

      const validActions = [
        "buy",
        "sell",
        "launch",
        "discover",
        "analyze",
        "wait",
        "stop",
      ];
      if (!validActions.includes(parsed.action)) {
        console.warn(`[AI Provider] Invalid action: ${parsed.action}`);
        return {
          action: "wait",
          params: { reason: "Invalid action" },
          reasoning: `Invalid action: ${parsed.action}`,
        };
      }

      return {
        action: parsed.action,
        params: parsed.params || {},
        reasoning: parsed.reasoning || "No reasoning provided",
        confidence: parsed.confidence || 0.5,
      };
    } catch (error: any) {
      console.error("[AI Provider] Failed to parse decision:", error.message);
      return {
        action: "wait",
        params: { reason: "Parse error" },
        reasoning: `Parse error: ${error.message}`,
      };
    }
  }
}
