#!/usr/bin/env node
import { ethers } from 'ethers';
import { X402LaunchClient } from '../src/client';
import * as dotenv from 'dotenv';

dotenv.config();

interface SellResult {
  tokenAddress: string;
  tokenName: string;
  balance: string;
  success: boolean;
  error?: string;
  usdcReceived?: string;
}

async function sellAllTokens(privateKey: string, backendUrl?: string) {
  console.log('\n🔄 Sell All Tokens Utility\n');
  
  // Initialize wallet
  const wallet = new ethers.Wallet(privateKey);
  console.log(`📍 Wallet Address: ${wallet.address}\n`);
  
  // Initialize client
  const client = new X402LaunchClient({
    wallet: { privateKey },
    baseUrl: backendUrl || process.env.BACKEND_URL || 'http://localhost:3001',
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    chainId: parseInt(process.env.CHAIN_ID || '84532'),
    network: process.env.NETWORK || 'base-sepolia'
  });
  
  try {
    // Get all tokens from backend
    console.log('📥 Fetching all tokens from backend...');
    const response = await client.discoverTokens();
    const tokens = response.tokens;
    console.log(`   Found ${tokens.length} tokens\n`);
    
    if (tokens.length === 0) {
      console.log('✅ No tokens found. Nothing to sell.');
      return;
    }
    
    // Check balance for each token
    console.log('💰 Checking balances on-chain...');
    const results: SellResult[] = [];
    
    // ERC-20 ABI for balanceOf
    const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
    
    // Connect to provider
    const provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || 'https://sepolia.base.org'
    );
    
    for (const token of tokens) {
      try {
        // Query balance directly from contract
        const tokenContract = new ethers.Contract(token.address, erc20Abi, provider);
        const balance = await tokenContract.balanceOf(wallet.address);
        
        if (balance > BigInt(0)) {
          console.log(`   ✓ ${token.name}: ${ethers.formatEther(balance)} tokens`);
          
          // Sell this token
          try {
            console.log(`     🔄 Selling...`);
            const sellResponse = await client.sellTokens({
              tokenAddress: token.address,
              tokenAmount: balance.toString()
            });
            
            results.push({
              tokenAddress: token.address,
              tokenName: token.name,
              balance: ethers.formatEther(balance),
              success: true,
              usdcReceived: sellResponse.usdcReceived
            });
            
            console.log(`     ✅ Sold! Received: ${sellResponse.usdcReceived} USDC\n`);
          } catch (sellError: any) {
            console.log(`     ❌ Failed: ${sellError.message}\n`);
            results.push({
              tokenAddress: token.address,
              tokenName: token.name,
              balance: ethers.formatEther(balance),
              success: false,
              error: sellError.message
            });
          }
        } else {
          console.log(`   - ${token.name}: 0 tokens (skip)`);
        }
        
        // Small delay to avoid overwhelming the RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.log(`   ⚠️  ${token.name}: Could not check balance - ${error.message}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
      console.log(`\n✅ Successfully sold ${successful.length} token(s):`);
      let totalUsdc = 0;
      successful.forEach(r => {
        const usdc = parseFloat(r.usdcReceived || '0');
        totalUsdc += usdc;
        console.log(`   - ${r.tokenName}: ${r.balance} tokens → ${r.usdcReceived} USDC`);
      });
      console.log(`   💰 Total USDC received: ${totalUsdc.toFixed(6)} USDC`);
    }
    
    if (failed.length > 0) {
      console.log(`\n❌ Failed to sell ${failed.length} token(s):`);
      failed.forEach(r => {
        console.log(`   - ${r.tokenName}: ${r.balance} tokens`);
        console.log(`     Error: ${r.error}`);
      });
    }
    
    if (results.length === 0) {
      console.log('\n✅ No tokens with balance found. Wallet is clean!');
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// CLI usage
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: pnpm run sell-all [options]

Options:
  --key <private-key>     Wallet private key (or set PRIVATE_KEY env var)
  --backend <url>         Backend URL (default: http://localhost:3001)
  --launcher, --agent1    Use Agent 1 wallet (AGENT_PRIVATE_KEY env var)
  --buyer, --agent2       Use Agent 2 wallet (AGENT_PRIVATE_KEY_2 env var)
  --help, -h              Show this help message

Examples:
  # Sell all from Agent 1 wallet
  pnpm run sell-all -- --agent1
  
  # Sell all from Agent 2 wallet
  pnpm run sell-all -- --agent2
  
  # Sell all from custom wallet
  pnpm run sell-all -- --key 0x1234...
  
  # Sell all with custom backend
  pnpm run sell-all -- --agent1 --backend http://localhost:3001
`);
  process.exit(0);
}

// Determine which private key to use
let privateKey: string | undefined;
let backendUrl: string | undefined;

const keyIndex = args.indexOf('--key');
if (keyIndex !== -1 && args[keyIndex + 1]) {
  privateKey = args[keyIndex + 1];
} else if (args.includes('--launcher') || args.includes('--agent1')) {
  privateKey = process.env.AGENT_PRIVATE_KEY;
  console.log('Using Agent 1 wallet (AGENT_PRIVATE_KEY)');
} else if (args.includes('--buyer') || args.includes('--agent2')) {
  privateKey = process.env.AGENT_PRIVATE_KEY_2;
  console.log('Using Agent 2 wallet (AGENT_PRIVATE_KEY_2)');
} else if (process.env.PRIVATE_KEY) {
  privateKey = process.env.PRIVATE_KEY;
  console.log('Using PRIVATE_KEY from .env');
}

const backendIndex = args.indexOf('--backend');
if (backendIndex !== -1 && args[backendIndex + 1]) {
  backendUrl = args[backendIndex + 1];
}

if (!privateKey) {
  console.error('❌ Error: No private key provided.');
  console.error('   Use --key, --launcher, --buyer, or set PRIVATE_KEY env var.');
  console.error('   Run with --help for more information.');
  process.exit(1);
}

// Run the sell
sellAllTokens(privateKey, backendUrl);

