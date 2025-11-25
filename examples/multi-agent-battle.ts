/**
 * Multi-Agent Battle Example
 * 
 * Runs TWO agents simultaneously:
 * 1. Launcher Agent - Launches new tokens every cycle
 * 2. Buyer Agent - Buys fresh launched tokens
 * 
 * This creates a real trading environment where agents interact!
 */

import 'dotenv/config';
import { AgentRunner, AgentConfig } from '../src/agent';

async function main() {
  console.log('🚀 x402 AgentPad - Multi-Agent Battle\n');
  console.log('Starting 2 agents that will trade against each other!\n');

  // Check environment
  if (!process.env.AGENT_PRIVATE_KEY) {
    console.error('❌ AGENT_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  if (!process.env.AGENT_PRIVATE_KEY_2) {
    console.error('❌ AGENT_PRIVATE_KEY_2 not set in .env');
    console.error('Add a second wallet private key for the buyer agent');
    process.exit(1);
  }

  // AGENT 1: Token Launcher
  const launcherConfig: AgentConfig = {
    agentId: 'launcher-001',
    name: 'Token Launcher',
    
    // Dashboard (monitor at http://localhost:3030)
    dashboardUrl: 'http://localhost:3030',
    
    // Execution Mode: 'auto' will detect based on ETH balance
    // - If wallet has ETH: Uses self-execute (0.5 USDC per trade)
    // - If no ETH: Uses gasless (2 USDC per trade)
    executionMode: 'auto',
    
    initialPrompt: `
      You are a token launcher agent.
      
      STRATEGY:
      - Launch a new token every cycle
      - Use creative names like "MoonCoin", "RocketToken", "DiamondHands", etc.
      - After launching, occasionally buy a small amount (1 USDC) of your own token
      - Focus on launching quality tokens
      
      ACTION PATTERN:
      - Cycle 1: Launch token
      - Cycle 2: Wait or buy own token
      - Cycle 3: Launch another token
      - Repeat
    `,
    
    maxPositionSizeUSDC: '1000000', // 1 USDC
    maxPositions: 2,
    minBalanceUSDC: '10000',
    reviewIntervalMs: 45000, // 45 seconds
    
    modelProvider: 'openai',
    modelName: 'gpt-4',
    
    onExecution: async (result) => {
      console.log(`\n🚀 [LAUNCHER] Execution:`);
      console.log(`   Action: ${result.action}`);
      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      if (result.decision?.reasoning) {
        console.log(`   💭 ${result.decision.reasoning.substring(0, 100)}...`);
      }
      if (result.executionResult?.tokenAddress) {
        console.log(`   📦 Token: ${result.executionResult.tokenAddress}`);
      }
      if (result.error) {
        console.log(`   ⚠️  ${result.error}`);
      }
    },
  };

  // AGENT 2: Token Buyer
  const buyerConfig: AgentConfig = {
    agentId: 'buyer-001',
    name: 'Token Buyer',
    
    // Dashboard (monitor at http://localhost:3030)
    dashboardUrl: 'http://localhost:3030',
    
    // Execution Mode: 'auto' will detect based on ETH balance
    // - If wallet has ETH: Uses self-execute (0.5 USDC per trade)
    // - If no ETH: Uses gasless (2 USDC per trade)
    executionMode: 'auto',
    
    initialPrompt: `
      You are an aggressive token buyer.
      
      STRATEGY:
      - Discover tokens every cycle
      - Focus on NEWLY launched tokens (progress < 10%)
      - Buy fresh tokens quickly (2 USDC per position)
      - Sell when profitable (+10%) or after 3 minutes
      
      BUYING RULES:
      - Only buy tokens with progress < 10% (fresh launches)
      - Check if you already own the token (don't buy twice)
      - Max 3 concurrent positions
      
      SELLING RULES:
      - Sell when profitable
      - Sell old positions after 3 minutes
    `,
    
    maxPositionSizeUSDC: '2000000', // 2 USDC
    maxPositions: 3,
    minBalanceUSDC: '10000',
    reviewIntervalMs: 30000, // 30 seconds (faster to catch launches)
    
    modelProvider: 'openai',
    modelName: 'gpt-4',
    
    onExecution: async (result) => {
      console.log(`\n💰 [BUYER] Execution:`);
      console.log(`   Action: ${result.action}`);
      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      if (result.decision?.reasoning) {
        console.log(`   💭 ${result.decision.reasoning.substring(0, 100)}...`);
      }
      if (result.executionResult?.tokenAddress) {
        console.log(`   📦 Token: ${result.executionResult.tokenAddress}`);
      }
      if (result.error) {
        console.log(`   ⚠️  ${result.error}`);
      }
    },
  };

  // Create both agents
  console.log('Creating agents...');
  
  const launcher = new AgentRunner(
    launcherConfig,
    process.env.AGENT_PRIVATE_KEY,
    {
      baseUrl: process.env.BACKEND_API_URL || 'https://api.launch.x402agentpad.io',
      chainId: parseInt(process.env.CHAIN_ID || '84532'),
      rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    }
  );

  const buyer = new AgentRunner(
    buyerConfig,
    process.env.AGENT_PRIVATE_KEY_2,
    {
      baseUrl: process.env.BACKEND_API_URL || 'https://api.launch.x402agentpad.io',
      chainId: parseInt(process.env.CHAIN_ID || '84532'),
      rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    }
  );

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down agents...');
    await Promise.all([
      launcher.stop(),
      buyer.stop(),
    ]);
    console.log('✅ All agents stopped');
    process.exit(0);
  });

  // Display info
  console.log('\n🤖 Agent Configuration:');
  console.log('\n🚀 Agent 1 - LAUNCHER:');
  console.log(`   ID: ${launcherConfig.agentId}`);
  console.log(`   Strategy: Launch tokens, occasionally buy own tokens`);
  console.log(`   Interval: ${launcherConfig.reviewIntervalMs / 1000}s`);
  
  console.log('\n💰 Agent 2 - BUYER:');
  console.log(`   ID: ${buyerConfig.agentId}`);
  console.log(`   Strategy: Buy fresh launches (progress < 10%)`);
  console.log(`   Interval: ${buyerConfig.reviewIntervalMs / 1000}s`);
  
  console.log('\n💡 Watch them trade against each other!');
  console.log('   → Launcher creates tokens');
  console.log('   → Buyer discovers and buys them');
  console.log('   → Real trading environment!\n');
  console.log('Press Ctrl+C to stop both agents\n');
  console.log('═'.repeat(60));

  // Start agents with a delay to avoid nonce conflicts
  console.log('\n✅ Starting agents...\n');
  console.log('Starting launcher agent...');
  launcher.start().catch(console.error); // Start but don't await
  
  // Wait 15 seconds before starting second agent to avoid facilitator nonce conflicts
  // Longer delay ensures first agent completes initial payment before second agent starts
  console.log('⏳ Waiting 15 seconds before starting buyer agent (avoiding nonce conflicts)...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  console.log('Starting buyer agent...\n');
  buyer.start().catch(console.error);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

