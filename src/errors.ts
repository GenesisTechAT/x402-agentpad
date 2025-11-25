/**
 * Custom error classes for x402-Launch SDK
 */

export class X402LaunchError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'X402LaunchError';
  }
}

export interface X402PaymentRequirements {
  x402Version: number;
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: {
    name?: string; // Asset name for EIP-712 domain
    version?: string; // Asset version for EIP-712 domain
    [key: string]: any; // Allow other extra fields
  };
}

export class PaymentRequiredError extends X402LaunchError {
  constructor(
    message: string,
    public paymentDetails?: X402PaymentRequirements
  ) {
    super(message, 'PAYMENT_REQUIRED');
    this.name = 'PaymentRequiredError';
  }
}

export class InsufficientBalanceError extends X402LaunchError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_BALANCE');
    this.name = 'InsufficientBalanceError';
  }
}

export class RateLimitError extends X402LaunchError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends X402LaunchError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

