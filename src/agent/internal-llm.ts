/**
 * Enhanced AI Provider for AgentPad
 * 
 * Uses x402 payment protocol for HTTP-based AI service calls.
 * No API keys required - just wallet-based payments.
 * 
 * @internal This is an internal module. Community members should use AgentRunner directly.
 */

import { ethers } from 'ethers';
import { createX402PaymentHeader } from '../payment';

export interface AgentPadLLMConfig {
  /** Wallet for x402 payments */
  wallet: ethers.Wallet;
  /** Ethereum provider */
  ethProvider: ethers.Provider;
  /** Chain ID (84532 for Base Sepolia) */
  chainId: number;
  /** USDC contract address */
  usdcAddress: string;
  /** x402 AI Service URL */
  aiServiceUrl?: string;
  /** AI provider (openai, anthropic, etc.) */
  provider?: string;
  /** Model name */
  modelName?: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
}

/**
 * AgentPad LLM Provider
 * 
 * Internal LLM provider that calls x402 AI service via HTTP
 * with automatic x402 payment handling.
 * 
 * @internal
 */
export class AgentPadLLM {
  private wallet: ethers.Wallet;
  private ethProvider: ethers.Provider;
  private chainId: number;
  private usdcAddress: string;
  public aiServiceUrl: string;
  public provider: string;
  public modelName: string;
  public temperature: number;
  public maxTokens: number;

  constructor(config: AgentPadLLMConfig) {
    this.wallet = config.wallet;
    this.ethProvider = config.ethProvider;
    this.chainId = config.chainId;
    this.usdcAddress = config.usdcAddress;
    this.aiServiceUrl = config.aiServiceUrl || 'https://api.ai.x402agentpad.io/v1/chat';
    this.provider = config.provider || 'openai';
    this.modelName = config.modelName || 'gpt-4';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 1000;
  }

  /**
   * Generate completion with x402 payment handling
   */
  async generate(prompt: string): Promise<string> {
    const requestBody = {
      model: this.modelName,
      provider: this.provider,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant for cryptocurrency trading.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    // Make initial request (may get 402 Payment Required)
    let response = await fetch(this.aiServiceUrl, {
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
        provider: this.ethProvider,
      });

      // Retry with payment
      response = await fetch(this.aiServiceUrl, {
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
      throw new Error(`x402 AI Service error: ${errorMessage}`);
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
      throw new Error(`Unexpected response format from x402 AI Service`);
    }

    return responseText.trim();
  }

  /**
   * Stream completion (for future use)
   */
  async *stream(prompt: string): AsyncGenerator<string> {
    // For now, return the full response
    // TODO: Implement streaming when x402 AI service supports it
    const response = await this.generate(prompt);
    yield response;
  }
}

