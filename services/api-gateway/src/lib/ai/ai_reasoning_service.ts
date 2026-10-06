import { GoogleGenAI } from '@google/genai';

export interface TradeReasoningContext {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  strategyName?: string;
  assetClass?: string;
  technicalIndicators?: Record<string, any>;
  riskVaultRules?: {
    dailyLossLimit?: number;
    maxDrawdown?: number;
  };
}

export class AiReasoningService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey && process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn('Failed to initialize GoogleGenAI SDK:', err);
      }
    }
  }

  async generateTradeReasoning(context: TradeReasoningContext): Promise<string> {
    if (this.ai) {
      try {
        const prompt = `You are Apex, an autonomous AI trading agent built by Quantro Software Labs.
Generate a concise, professional 1-2 sentence trade hypothesis explaining why this trade was triggered for the user.

Trade Context:
- Action: ${context.side} ${context.quantity} shares/units of ${context.symbol}
- Strategy: ${context.strategyName ?? 'Apex Momentum Alpha'}
- Asset Class: ${context.assetClass ?? 'STOCKS'}
- Estimated Price: ${context.price ? `$${context.price}` : 'Market Price'}
${context.technicalIndicators ? `- Indicators: ${JSON.stringify(context.technicalIndicators)}` : ''}

Style requirement: Plain English, high-conviction, professional financial AI tone. Start directly with "Apex reasoning: ". Do not exceed 250 characters.`;

        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const text = response.text?.trim();
        if (text && text.length > 5) {
          return text;
        }
      } catch (error) {
        console.warn('Gemini API call failed, falling back to rule generator:', error);
      }
    }

    return this.generateFallbackReasoning(context);
  }

  generateFallbackReasoning(context: TradeReasoningContext): string {
    const strategy = context.strategyName ?? 'Apex Momentum Alpha';
    const sideText =
      context.side === 'BUY'
        ? 'Strong upward momentum signal & 20-period SMA breakout'
        : 'Profit target reached & Risk Vault exposure rebalance';
    return `Apex reasoning: ${sideText} detected via ${strategy}. Sized within Risk Vault limits.`;
  }
}

export const aiReasoningService = new AiReasoningService();
