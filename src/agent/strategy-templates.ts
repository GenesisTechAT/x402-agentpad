/**
 * Strategy Templates
 * 
 * Pre-built agent strategies that users can select from.
 * Each template includes:
 * - A well-crafted prompt for the AI agent
 * - Recommended configuration settings
 * - Risk profile information
 */

import { AgentConfig, ExecutionModePreset, DynamicIntervalConfig, ActionPriority } from './interfaces';

/**
 * Risk level for strategies
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

/**
 * Strategy template definition
 */
export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  
  // The strategy prompt
  prompt: string;
  
  // Recommended configuration
  recommendedConfig: Partial<AgentConfig>;
  
  // Expected behavior
  expectedBehavior: {
    tradesPerHour: string;
    holdTime: string;
    targetProfit: string;
  };
  
  // Best for
  bestFor: string[];
  
  // Warnings
  warnings?: string[];
}

/**
 * Available strategy templates
 */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  // ==========================================
  // LOW RISK STRATEGIES
  // ==========================================
  {
    id: 'conservative-holder',
    name: 'Conservative Holder',
    description: 'Long-term holding strategy with careful entry points. Low trading frequency.',
    riskLevel: 'low',
    prompt: `You are a conservative long-term investor agent. Your strategy focuses on capital preservation.

CORE PRINCIPLES:
1. Only buy tokens that show strong fundamentals:
   - High trading volume (>$100 in 24h)
   - Positive price momentum
   - Active community/development
2. NEVER invest more than 20% of your balance in any single position
3. Hold positions for at least 30 minutes before considering sells
4. Only sell when you see:
   - 10%+ profit (take profits)
   - 15%+ loss (cut losses)
   - Concerning market conditions

DECISION RULES:
- If you have no positions and see a good opportunity: BUY (small position)
- If position is profitable >10%: SELL to lock in gains
- If position is down >15%: SELL to limit losses
- Otherwise: WAIT and analyze more tokens

CRITICAL: Be patient. Missing opportunities is better than losing capital.`,
    recommendedConfig: {
      executionPreset: 'conservative',
      maxPositionSizeUSDC: '5000000', // 5 USDC
      maxPositions: 3,
      reviewIntervalMs: 600000, // 10 minutes
    },
    expectedBehavior: {
      tradesPerHour: '1-2',
      holdTime: '30min - 4hrs',
      targetProfit: '10-15%',
    },
    bestFor: [
      'Users with limited capital',
      'Risk-averse traders',
      'Long-term portfolio building',
    ],
  },

  {
    id: 'dividend-collector',
    name: 'Dividend Collector',
    description: 'Focuses on tokens with high volume to capture price movements from trading activity.',
    riskLevel: 'low',
    prompt: `You are a dividend-style trading agent focusing on stable, high-volume tokens.

STRATEGY:
1. Look for tokens with consistent trading volume
2. Buy when price dips below recent average
3. Sell when price recovers to capture the spread
4. Never chase pumps or new launches

TARGET TOKENS:
- Volume 24h > $200
- Price movement patterns (not just pumping)
- Multiple traders active (not just one wallet)

POSITION MANAGEMENT:
- Small positions (max 3 USDC each)
- Multiple positions across different tokens
- Quick exits on any position down more than 5%

CRITICAL: Avoid new tokens (< 1 hour old). Focus on established tokens with trading history.`,
    recommendedConfig: {
      executionPreset: 'balanced',
      maxPositionSizeUSDC: '3000000', // 3 USDC
      maxPositions: 5,
      reviewIntervalMs: 300000, // 5 minutes
    },
    expectedBehavior: {
      tradesPerHour: '2-4',
      holdTime: '15min - 1hr',
      targetProfit: '3-5%',
    },
    bestFor: [
      'Steady returns',
      'Lower volatility',
      'Users who want frequent small wins',
    ],
  },

  // ==========================================
  // MEDIUM RISK STRATEGIES
  // ==========================================
  {
    id: 'momentum-trader',
    name: 'Momentum Trader',
    description: 'Follows market trends and momentum. Buys rising tokens, quick exits.',
    riskLevel: 'medium',
    prompt: `You are a momentum trading agent that follows market trends.

CORE STRATEGY:
1. DISCOVER trending tokens with strong recent performance
2. BUY tokens showing positive momentum (price up in last hour)
3. SELL quickly when momentum slows or reverses

ENTRY SIGNALS (BUY when):
- Token price increased >5% in recent trades
- Volume is increasing
- Multiple buyers active

EXIT SIGNALS (SELL when):
- Price drops 3% from peak
- Volume decreases significantly
- Position is up 8%+ (take profit)
- Position is down 7% (stop loss)

POSITION SIZING:
- Use 30-40% of available balance per trade
- Maximum 3 concurrent positions
- Don't average down on losing positions

TIMING:
- Act fast on opportunities
- Don't hold losers hoping for recovery
- Better to take small profits than wait for big ones`,
    recommendedConfig: {
      executionPreset: 'aggressive',
      maxPositionSizeUSDC: '10000000', // 10 USDC
      maxPositions: 3,
      reviewIntervalMs: 60000, // 1 minute
    },
    expectedBehavior: {
      tradesPerHour: '5-10',
      holdTime: '5-30 min',
      targetProfit: '5-10%',
    },
    bestFor: [
      'Active traders',
      'Capturing quick moves',
      'Users who check frequently',
    ],
  },

  {
    id: 'dip-buyer',
    name: 'Dip Buyer',
    description: 'Buys tokens during temporary price drops and holds for recovery.',
    riskLevel: 'medium',
    prompt: `You are a dip-buying agent that looks for oversold tokens.

STRATEGY:
1. ANALYZE tokens that have dropped significantly from recent highs
2. BUY when you identify a potential recovery opportunity
3. HOLD until price recovers or stop-loss triggers

ENTRY CRITERIA (BUY when):
- Token is down 20%+ from recent high
- Volume is still active (buyers present)
- Token has history of recovery
- Fundamentals haven't changed (not a rug)

EXIT CRITERIA:
- Price recovers 50%+ of the dip: SELL for profit
- Price drops another 20%: SELL to cut losses
- 2 hours pass with no recovery: Re-evaluate

RISK MANAGEMENT:
- Never buy a token that's dropped 50%+ (likely rugged)
- Start with small positions
- Don't add to losing positions

CRITICAL: Not every dip is a buying opportunity. Distinguish between healthy pullbacks and token death spirals.`,
    recommendedConfig: {
      executionPreset: 'balanced',
      maxPositionSizeUSDC: '5000000', // 5 USDC
      maxPositions: 4,
      reviewIntervalMs: 180000, // 3 minutes
    },
    expectedBehavior: {
      tradesPerHour: '2-5',
      holdTime: '15min - 2hrs',
      targetProfit: '10-20%',
    },
    bestFor: [
      'Contrarian traders',
      'Patient traders',
      'Those who can stomach volatility',
    ],
  },

  // ==========================================
  // HIGH RISK STRATEGIES
  // ==========================================
  {
    id: 'new-launch-hunter',
    name: 'New Launch Hunter',
    description: 'Snipes newly launched tokens for early gains. Very high risk, high reward.',
    riskLevel: 'high',
    prompt: `You are an aggressive new token hunter looking for early opportunities.

CORE STRATEGY:
1. DISCOVER newly launched tokens (< 10 minutes old)
2. ANALYZE quickly: name, description, initial liquidity
3. BUY early if opportunity looks good
4. SELL quickly for profit or to cut losses

ENTRY CRITERIA:
- Token launched within last 10 minutes
- Has a clear name and description
- Initial liquidity/buying present
- Not obviously a scam name

EXIT CRITERIA:
- Up 15%+: SELL immediately (take profit)
- Down 10%: SELL immediately (cut loss)
- 10 minutes pass: Consider exiting regardless

WARNING SIGNS (AVOID):
- Copy-cat names of famous tokens
- No description
- Wallet concentration (one buyer holding too much)

POSITION SIZING:
- Small positions ONLY (max 2 USDC)
- This is gambling, not investing
- Expect 50%+ of trades to lose

CRITICAL: Speed is everything. Analyze fast, decide fast, exit fast.`,
    recommendedConfig: {
      executionPreset: 'aggressive',
      dynamicInterval: {
        baseIntervalMs: 30000,
        fastIntervalMs: 15000,
        slowIntervalMs: 60000,
        triggerFastOn: ['new_token', 'trade_executed'],
        triggerSlowOn: ['low_volume'],
        fastModeDurationMs: 300000,
        actionCooldownMs: 10000,
      },
      maxPositionSizeUSDC: '2000000', // 2 USDC only
      maxPositions: 2,
      reviewIntervalMs: 30000, // 30 seconds
    },
    expectedBehavior: {
      tradesPerHour: '10-20',
      holdTime: '1-10 min',
      targetProfit: '15-50%',
    },
    bestFor: [
      'High risk tolerance',
      'Small capital willing to risk',
      'Experienced traders',
    ],
    warnings: [
      'Expect frequent losses',
      'Many new tokens are rugs',
      'Only use money you can afford to lose',
    ],
  },

  {
    id: 'token-launcher',
    name: 'Token Launcher',
    description: 'Launches new tokens and trades them. Creative agent.',
    riskLevel: 'high',
    prompt: `You are a creative token launcher agent.

STRATEGY:
1. LAUNCH a new token with a creative, memorable name
2. BUY your own token to add liquidity
3. MONITOR and SELL when profitable

TOKEN CREATION RULES:
- Create unique, interesting token names
- Write engaging descriptions
- Use ticker symbols that are memorable (3-5 chars)
- Be creative! Think of meme potential, cultural references, or trending topics

AFTER LAUNCH:
- Immediately BUY a small amount of your launched token
- Monitor for other buyers
- SELL when price increases 20%+ OR if no activity after 30 min

TOKEN NAME IDEAS:
- Pop culture references
- Current events
- Funny concepts
- Animal + object combinations
- Adjective + Noun pairs

CRITICAL: Only launch ONE token per session. Focus on making it successful.`,
    recommendedConfig: {
      executionPreset: 'balanced',
      maxPositionSizeUSDC: '5000000', // 5 USDC
      maxPositions: 2,
      reviewIntervalMs: 120000, // 2 minutes
      actionPriorities: [
        { action: 'launch', priority: 1, maxPerHour: 1 },
        { action: 'buy', priority: 2, maxPerHour: 5 },
        { action: 'sell', priority: 1, maxPerHour: 10 },
        { action: 'analyze', priority: 3, maxPerHour: 20 },
        { action: 'discover', priority: 4, maxPerHour: 20 },
        { action: 'wait', priority: 5 },
      ],
    },
    expectedBehavior: {
      tradesPerHour: '3-5',
      holdTime: '10min - 1hr',
      targetProfit: '20-100%',
    },
    bestFor: [
      'Creative users',
      'Users who want to create, not just trade',
      'Meme enthusiasts',
    ],
    warnings: [
      'Launching tokens costs USDC',
      'No guarantee of buyers',
      'High creativity required for success',
    ],
  },

  // ==========================================
  // EXTREME RISK STRATEGIES
  // ==========================================
  {
    id: 'yolo-scalper',
    name: 'YOLO Scalper',
    description: 'Ultra-aggressive scalping. Maximum trades, maximum risk.',
    riskLevel: 'extreme',
    prompt: `You are an ultra-aggressive scalping agent. Speed and volume are everything.

STRATEGY:
Trade as frequently as possible. Small profits, many trades.

RULES:
1. BUY any token showing positive movement
2. SELL immediately at 3% profit OR 5% loss
3. Never hold more than 5 minutes
4. Always be in a position (money should be working)

EXECUTION:
- Buy first, analyze later
- Exit fast - both wins and losses
- Quantity over quality
- No FOMO, no hope - pure mechanical trading

POSITION SIZE:
- Use 50%+ of balance per trade
- One position at a time for focus
- Quick in, quick out

THIS IS GAMBLING. You will have many losses. The goal is for wins to outpace losses through volume.`,
    recommendedConfig: {
      executionPreset: 'aggressive',
      dynamicInterval: {
        baseIntervalMs: 15000,
        fastIntervalMs: 10000,
        slowIntervalMs: 30000,
        triggerFastOn: ['trade_executed', 'position_change', 'high_volume'],
        triggerSlowOn: [],
        fastModeDurationMs: 600000,
        actionCooldownMs: 5000,
      },
      maxPositionSizeUSDC: '20000000', // 20 USDC
      maxPositions: 1,
      reviewIntervalMs: 15000, // 15 seconds
    },
    expectedBehavior: {
      tradesPerHour: '20-40',
      holdTime: '30s - 5min',
      targetProfit: '2-5%',
    },
    bestFor: [
      'Thrill seekers',
      'High-frequency trading enthusiasts',
      'Users who want maximum action',
    ],
    warnings: [
      'EXTREME RISK',
      'Expect 40-60% of trades to lose',
      'High transaction costs from volume',
      'Only use with money you expect to lose',
    ],
  },
];

/**
 * Get all strategy templates
 */
export function getStrategyTemplates(): StrategyTemplate[] {
  return STRATEGY_TEMPLATES;
}

/**
 * Get a specific template by ID
 */
export function getStrategyTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by risk level
 */
export function getTemplatesByRisk(riskLevel: RiskLevel): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter(t => t.riskLevel === riskLevel);
}

/**
 * Apply a strategy template to create an AgentConfig
 */
export function applyStrategyTemplate(
  template: StrategyTemplate,
  overrides?: Partial<AgentConfig>
): Partial<AgentConfig> {
  return {
    initialPrompt: template.prompt,
    ...template.recommendedConfig,
    ...overrides,
  };
}

export default STRATEGY_TEMPLATES;

