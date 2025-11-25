/**
 * AgentPad Example
 * 
 * Simple example showing how to run an autonomous trading agent using x402 AgentPad SDK.
 * 
 * Perfect for:
 * - Community members running agents on their own PCs
 * - Testing agent strategies locally
 * - Learning how to build trading agents
 * 
 * Usage:
 *   pnpm run example                  # Auto-detect mode (based on ETH balance)
 *   pnpm run example:gasless          # Force gasless mode (no ETH needed, 2 USDC per trade)
 *   pnpm run example:self-execute     # Force self-execute mode (requires ETH, 0.5 USDC per trade)
 * 
 * Or with tsx directly:
 *   tsx examples/agentpad-example.ts --gasless
 *   tsx examples/agentpad-example.ts --self-execute
 */

import 'dotenv/config';
import { AgentRunner, AgentConfig } from '../src/agent';

async function main() {
  console.log('🚀 x402 AgentPad - Autonomous Trading Agent\n');

  // Check environment
  if (!process.env.AGENT_PRIVATE_KEY) {
    console.error('❌ AGENT_PRIVATE_KEY not set in .env');
    console.error('\nCreate a .env file with:');
    console.error('AGENT_PRIVATE_KEY=0x...');
    process.exit(1);
  }

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const gaslessFlag = args.includes('--gasless');
  const selfExecuteFlag = args.includes('--self-execute');
  
  // Determine execution mode
  let executionMode: 'auto' | 'gasless' | 'self-execute' = 'auto';
  if (gaslessFlag) {
    executionMode = 'gasless';
    console.log('💸 Forced GASLESS mode (via --gasless flag)\n');
  } else if (selfExecuteFlag) {
    executionMode = 'self-execute';
    console.log('⚡ Forced SELF-EXECUTE mode (via --self-execute flag)\n');
  } else {
    console.log('🔄 AUTO mode - will detect based on ETH balance\n');
  }

  // Configure your agent - FULL FLOW TEST
  const config: AgentConfig = {
    agentId: 'test-launcher-001',
    name: 'Full Flow Test Agent',
    
    // Execution Mode Options:
    // - 'auto': Automatically detect based on ETH balance (default, recommended)
    // - 'gasless': Backend pays gas, higher fee (2 USDC per trade, no ETH needed)
    // - 'self-execute': Agent pays gas, lower fee (0.5 USDC per trade, requires ETH)
    // Command-line flags: --gasless or --self-execute to override
    executionMode, // Set from command-line args or default to 'auto'
    
    // Dashboard (optional - for visual monitoring)
    // Start dashboard: pnpm run dashboard
    // Then open: http://localhost:3030
    dashboardUrl: 'http://localhost:3030',
    
    // Test strategy: Launch → Buy → Hold → Sell (tests complete flow!)
    initialPrompt: `
     
      PHASE 1 - LAUNCH (First execution):
      - Launch a new token named "TestToken" with ticker "TEST"
      - Description: "Testing the full agent flow"
      - Use a simple placeholder image URL
      
      PHASE 2 - BUY (Second execution):
      - Buy the token you just launched
      - Use 3 USDC (3000000 in atomic units)
      - This tests the buy flow
      
      PHASE 3 - SELL (Third execution):
      - Sell the entire position
      - This completes the full flow test
      
      IMPORTANT:
      - Execute ONE phase per review cycle
      - Track which phase you're on in your reasoning
      - Be methodical and clear
    `,
    
    // Risk management
    maxPositionSizeUSDC: '3000000', // 3 USDC max per position (6 decimals)
    maxPositions: 1,                // Only 1 position for testing
    minBalanceUSDC: '10000',        // Stop if balance < 0.01 USDC
    
    // Fast execution for testing
    reviewIntervalMs: 30000, // Review every 30 seconds (fast for testing!)
    
    // AI Model configuration (uses x402 AI service with automatic payments)
    modelProvider: 'openai',
    modelName: 'gpt-4',
    // modelApiUrl: 'https://api.ai.x402agentpad.io/v1/chat', // Default
    
    // Working hours (optional - default is 24/7)
    // workingHoursStart: 9,  // Start at 9 AM
    // workingHoursEnd: 17,   // Stop at 5 PM
    
    // Lifecycle hooks (optional - for monitoring)
    onStart: async () => {
      console.log('✅ Agent started successfully!');
      console.log('💡 Agent is now analyzing markets and making trades...\n');
    },
    
    onExecution: async (result) => {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📊 Execution #${result.timestamp}:`);
      console.log(`   Action: ${result.action}`);
      console.log(`   Success: ${result.success ? '✅' : '❌'}`);
      
      if (result.decision) {
        console.log(`\n💭 Agent Reasoning:`);
        console.log(`   ${result.decision.reasoning || 'No reasoning provided'}`);
      }
      
      if (result.executionResult) {
        console.log(`\n📦 Execution Result:`);
        if (result.executionResult.tokenAddress) {
          console.log(`   Token Address: ${result.executionResult.tokenAddress}`);
        }
        if (result.executionResult.transactionHash) {
          console.log(`   TX Hash: ${result.executionResult.transactionHash}`);
        }
        if (result.executionResult.message) {
          console.log(`   Message: ${result.executionResult.message}`);
        }
      }
      
      if (result.balanceBefore && result.balanceAfter) {
        const before = Number(result.balanceBefore) / 1e6;
        const after = Number(result.balanceAfter) / 1e6;
        const change = after - before;
        const costUSDC = Math.abs(change);
        console.log(`\n💰 Balance: ${before.toFixed(2)} → ${after.toFixed(2)} USDC`);
        if (change < 0) {
          console.log(`   Cost: ${costUSDC.toFixed(4)} USDC (AI decision cost)`);
        }
      }
      
      if (result.error) {
        console.log(`\n⚠️  Error: ${result.error}`);
      }
      
      console.log(`${'═'.repeat(60)}`);
    },
    
    onError: async (error) => {
      console.error('\n❌ Agent error:', error.message);
      console.error('The agent will retry automatically...');
    },
    
    onStop: async () => {
      console.log('\n🛑 Agent stopped gracefully');
    },
  };

  // Create agent runner
  const runner = new AgentRunner(
    config,
    process.env.AGENT_PRIVATE_KEY,
    {
      // Optional: Customize API endpoints
      baseUrl: process.env.BACKEND_API_URL || 'https://api.launch.x402agentpad.io',
      chainId: parseInt(process.env.CHAIN_ID || '84532'), // Base Sepolia
      rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    }
  );

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down agent...');
    await runner.stop();
    process.exit(0);
  });

  // Display agent info
  console.log('🤖 Agent Configuration:');
  console.log(`   Agent ID: ${config.agentId}`);
  console.log(`   Model: ${config.modelProvider}/${config.modelName}`);
  console.log(`   Max Positions: ${config.maxPositions}`);
  console.log(`   Max Position Size: ${Number(config.maxPositionSizeUSDC) / 1e6} USDC`);
  console.log(`   Review Interval: ${config.reviewIntervalMs / 1000}s`);
  console.log(`   Execution Mode: ${config.initialPrompt}`);
  // Config displayed above - no need to repeat prompt
  console.log('\n💡 Press Ctrl+C to stop the agent\n');
  console.log('═'.repeat(60));

  // Start the agent
  await runner.start();
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});

