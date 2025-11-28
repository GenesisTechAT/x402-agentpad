/**
 * OpenRouter AI Provider
 * 
 * Provides access to 50+ AI models through OpenRouter API
 * with smart routing, fallback support, and x402 payment option
 */

import { ethers } from 'ethers';
import { AgentConfig, IAIModelProvider, OpenRouterConfig, OpenRouterModel } from './interfaces';
import { createX402PaymentHeader } from '../payment';

/**
 * Model cost information (per 1M tokens)
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },
  'openai/gpt-4': { input: 30.00, output: 60.00 },
  'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  
  // Anthropic
  'anthropic/claude-3-opus': { input: 15.00, output: 75.00 },
  'anthropic/claude-3-sonnet': { input: 3.00, output: 15.00 },
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  
  // Google
  'google/gemini-pro-1.5': { input: 2.50, output: 7.50 },
  'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
  
  // Meta
  'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.055, output: 0.055 },
  
  // Mistral
  'mistralai/mistral-large': { input: 2.00, output: 6.00 },
  'mistralai/mistral-medium': { input: 2.70, output: 8.10 },
  'mistralai/mistral-7b-instruct': { input: 0.06, output: 0.06 },
  
  // Cohere
  'cohere/command-r-plus': { input: 2.50, output: 10.00 },
  'cohere/command-r': { input: 0.15, output: 0.60 },
};

/**
 * Recommended models by task type
 */
const TASK_RECOMMENDATIONS: Record<string, string[]> = {
  // Complex analysis and decision making
  analysis: [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'anthropic/claude-3-opus',
    'google/gemini-pro-1.5',
  ],
  
  // Trading decisions (need accuracy)
  decision: [
    'anthropic/claude-3-opus',
    'openai/gpt-4',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4-turbo',
  ],
  
  // Simple checks, fast responses
  simple: [
    'anthropic/claude-3-haiku',
    'openai/gpt-4o-mini',
    'mistralai/mistral-7b-instruct',
    'google/gemini-flash-1.5',
  ],
};

/**
 * OpenRouter AI Provider
 */
export class OpenRouterProvider implements IAIModelProvider {
  private config: OpenRouterConfig;
  private wallet?: ethers.Wallet;
  private provider?: ethers.Provider;
  private chainId: number;
  private usdcAddress: string;
  private baseUrl: string;
  private retryCount: Map<string, number> = new Map();

  constructor(
    config: OpenRouterConfig,
    wallet?: ethers.Wallet,
    provider?: ethers.Provider,
    chainId: number = 84532,
    usdcAddress: string = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  ) {
    this.config = {
      baseUrl: 'https://openrouter.ai/api/v1',
      // routingStrategy is handled by ...config below
      enableFallback: true,
      maxRetriesPerModel: 2,
      ...config,
    };
    this.wallet = wallet;
    this.provider = provider;
    this.chainId = chainId;
    this.usdcAddress = usdcAddress;
    this.baseUrl = this.config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  /**
   * Call AI model with routing and fallback support
   */
  async callModel(prompt: string, agentConfig: AgentConfig): Promise<string> {
    const models = this.selectModels();
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        const response = await this.callSingleModel(model, prompt, agentConfig);
        this.retryCount.delete(model.id); // Reset on success
        return response;
      } catch (error: any) {
        console.warn(`[OpenRouter] Model ${model.id} failed: ${error.message}`);
        lastError = error;

        // Track retries
        const retries = (this.retryCount.get(model.id) || 0) + 1;
        this.retryCount.set(model.id, retries);

        // Check if we should try next model
        if (retries >= (this.config.maxRetriesPerModel || 2)) {
          console.log(`[OpenRouter] Max retries for ${model.id}, trying next model`);
          continue;
        }

        // If fallback is disabled, throw immediately
        if (!this.config.enableFallback) {
          throw error;
        }
      }
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * Select models based on routing strategy
   */
  private selectModels(): OpenRouterModel[] {
    const { models, routingStrategy } = this.config;

    switch (routingStrategy) {
      case 'primary-fallback':
        // Primary first, then fallbacks sorted by role
        return [
          ...models.filter(m => m.role === 'primary'),
          ...models.filter(m => m.role === 'fallback'),
          ...models.filter(m => m.role === 'cheap'),
        ];

      case 'cost-optimized':
        // Sort by cost (cheapest first)
        return [...models].sort((a, b) => {
          const costA = MODEL_COSTS[a.id]?.input || 999;
          const costB = MODEL_COSTS[b.id]?.input || 999;
          return costA - costB;
        });

      case 'round-robin':
        // Rotate through models
        const rotation = Date.now() % models.length;
        return [...models.slice(rotation), ...models.slice(0, rotation)];

      case 'task-based':
        // This would be set dynamically based on task type
        return models;

      default:
        return models;
    }
  }

  /**
   * Get best models for a specific task type
   */
  getModelsForTask(taskType: 'analysis' | 'decision' | 'simple'): string[] {
    return TASK_RECOMMENDATIONS[taskType] || TASK_RECOMMENDATIONS.decision;
  }

  /**
   * Call a single model
   */
  private async callSingleModel(
    model: OpenRouterModel,
    prompt: string,
    agentConfig: AgentConfig
  ): Promise<string> {
    const requestBody = {
      model: model.id,
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
      temperature: model.temperature ?? 0.3,
      max_tokens: model.maxTokens ?? 500,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://x402agentpad.io',
      'X-Title': 'x402 AgentPad',
    };

    // Add API key if available
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Make request
    let response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    // Handle 402 Payment Required (x402)
    if (response.status === 402 && this.wallet && this.provider) {
      const paymentDetails = await response.json() as any;

      if (paymentDetails.accepts && paymentDetails.accepts.length > 0) {
        const paymentInfo = paymentDetails.accepts[0];

        const paymentHeader = await createX402PaymentHeader(this.wallet, {
          amount: paymentInfo.maxAmountRequired,
          recipient: paymentInfo.payTo,
          asset: paymentInfo.asset || this.usdcAddress,
          chainId: this.chainId,
          provider: this.provider,
        });

        headers['X-PAYMENT'] = paymentHeader;

        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as any;
      throw new Error(`OpenRouter API error: ${error.error?.message || error.message || response.statusText}`);
    }

    const data = await response.json() as any;

    // Extract content from response
    let content = '';
    if (data.choices && data.choices[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.content) {
      content = typeof data.content === 'string' ? data.content : data.content[0]?.text;
    }

    // Clean markdown code blocks
    content = content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    return content;
  }

  /**
   * Get estimated cost for a model
   */
  getModelCost(modelId: string): { input: number; output: number } | null {
    return MODEL_COSTS[modelId] || null;
  }

  /**
   * Get all available models with their costs
   */
  static getAvailableModels(): Array<{
    id: string;
    displayName: string;
    costPer1kTokens: number;
    provider: string;
  }> {
    return Object.entries(MODEL_COSTS).map(([id, cost]) => {
      const [provider, name] = id.split('/');
      return {
        id,
        displayName: name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        costPer1kTokens: (cost.input + cost.output) / 2 / 1000, // Average cost per 1K tokens
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
      };
    });
  }
}

/**
 * Create default OpenRouter config for common use cases
 */
export function createOpenRouterConfig(
  preset: 'cost-effective' | 'balanced' | 'premium',
  apiKey?: string
): OpenRouterConfig {
  switch (preset) {
    case 'cost-effective':
      return {
        apiKey,
        routingStrategy: 'cost-optimized',
        enableFallback: true,
        maxRetriesPerModel: 2,
        models: [
          { id: 'anthropic/claude-3-haiku', role: 'primary', temperature: 0.3 },
          { id: 'openai/gpt-4o-mini', role: 'fallback', temperature: 0.3 },
          { id: 'mistralai/mistral-7b-instruct', role: 'cheap', temperature: 0.3 },
        ],
      };

    case 'balanced':
      return {
        apiKey,
        routingStrategy: 'primary-fallback',
        enableFallback: true,
        maxRetriesPerModel: 2,
        models: [
          { id: 'anthropic/claude-3.5-sonnet', role: 'primary', temperature: 0.3 },
          { id: 'openai/gpt-4o', role: 'fallback', temperature: 0.3 },
          { id: 'anthropic/claude-3-haiku', role: 'cheap', temperature: 0.3 },
        ],
      };

    case 'premium':
      return {
        apiKey,
        routingStrategy: 'primary-fallback',
        enableFallback: true,
        maxRetriesPerModel: 3,
        models: [
          { id: 'anthropic/claude-3-opus', role: 'primary', temperature: 0.3, maxTokens: 1000 },
          { id: 'openai/gpt-4', role: 'fallback', temperature: 0.3, maxTokens: 1000 },
          { id: 'anthropic/claude-3.5-sonnet', role: 'fallback', temperature: 0.3 },
        ],
      };
  }
}

export default OpenRouterProvider;

