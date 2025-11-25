/**
 * x402 Payment Protocol Helpers
 * 
 * Implements x402 payment protocol using EIP-712 typed data signing
 * Based on: https://github.com/coinbase/x402
 */

import { ethers } from 'ethers';
import { X402PaymentRequirements } from './errors';

export interface X402PaymentConfig {
  amount: string; // Amount in atomic units (e.g., "1000000" for 1 USDC)
  recipient: string; // Recipient address (payTo)
  asset: string; // Asset address (e.g., USDC address)
  chainId: number; // Chain ID (e.g., 84532 for Base Sepolia)
  provider: ethers.Provider; // Ethers provider for contract queries
  name?: string; // Optional: Asset name for EIP-712 domain (from payment requirements)
  version?: string; // Optional: Asset version for EIP-712 domain (from payment requirements)
}

// X402PaymentRequirements is defined in errors.ts to avoid circular dependencies

/**
 * Create x402 payment header with EIP-712 signature
 * 
 * This creates a payment authorization that can be verified by the facilitator
 * and settled on-chain. The payment uses EIP-712 typed data signing for security.
 */
export async function createX402PaymentHeader(
  wallet: ethers.Wallet,
  config: X402PaymentConfig
): Promise<string> {
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  // Use timestamp slightly in the past to ensure validAfter <= block.timestamp when tx executes
  const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past
  const validAfter = String(timestamp);
  const validBefore = String(timestamp + 300); // 5 minutes default timeout

  // Query contract for EIP-712 domain name and version
  let domainName: string;
  let domainVersion: string;
  
  // PRIORITY 1: Use name/version from payment requirements if provided
  // This ensures the signature matches what the backend expects
  if (config.name && config.version) {
    domainName = config.name;
    domainVersion = config.version;
    console.log(`[SDK Payment] Using backend-provided EIP-712 domain: name="${domainName}", version="${domainVersion}"`);
  } else {
    // PRIORITY 2: Try to query the contract
    try {
      const contractABI = [
        'function name() view returns (string)',
        'function version() view returns (string)',
      ];
      const contract = new ethers.Contract(config.asset, contractABI, config.provider);
      
      domainName = await contract.name();
      try {
        domainVersion = await contract.version();
      } catch {
        // Many ERC20 tokens don't have version(), use default
        // AgentToken uses version "1" (from EIP712(name, "1"))
        domainVersion = '1';
      }
      console.log(`[SDK Payment] Queried contract for EIP-712 domain: name="${domainName}", version="${domainVersion}"`);
    } catch (error) {
      // PRIORITY 3: Fallback to defaults based on asset type
      const network = await config.provider.getNetwork();
      const usdcAddresses: Record<number, string> = {
        84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
        8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
      };
      const isUSDCAddress = usdcAddresses[Number(network.chainId)]?.toLowerCase() === config.asset.toLowerCase();
      
      if (isUSDCAddress) {
        // USDC typically uses name="USDC", version="2"
        domainName = 'USDC';
        domainVersion = '2';
      } else {
        // For tokens (like AgentToken), use defaults that match AgentToken.sol
        // AgentToken uses EIP712(name, "1"), so version is "1"
        domainName = 'Token'; // Generic fallback
        domainVersion = '1'; // AgentToken uses version "1"
      }
    }
  }

  const domain = {
    name: domainName,
    version: domainVersion,
    chainId: config.chainId,
    verifyingContract: config.asset,
  };

  // EIP-712 types for TransferWithAuthorization (EIP-3009)
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Message to sign
  const message = {
    from: wallet.address,
    to: config.recipient,
    value: BigInt(config.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce,
  };

  // Sign using EIP-712 typed data
  const signature = await wallet.signTypedData(domain, types, message);

  // Create payload (x402 standard format)
  const payload = {
    payer: wallet.address,
    amount: config.amount,
    asset: config.asset,
    recipient: config.recipient,
    nonce: nonce,
    signature: signature,
    timestamp: timestamp,
  };

  // Encode as base64
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Extract payment requirements from 402 response
 */
export function extractPaymentRequirements(
  responseData: any
): X402PaymentRequirements | null {
  if (responseData.accepts && responseData.accepts.length > 0) {
    return responseData.accepts[0];
  }
  return null;
}

