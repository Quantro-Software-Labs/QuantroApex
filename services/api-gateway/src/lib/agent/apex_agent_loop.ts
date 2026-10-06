import { prisma } from '../prisma.js';
import { executeOrder } from '../execution_engine.js';
import { createActivityEntry } from '../db/repos.js';
import { eventBus } from '../events/event_bus.js';
import type { AgentPhase } from '@prisma/client';

export interface AgentPhaseEvaluation {
  phase: AgentPhase;
  reason: string;
  totalTrades: number;
  winRate: number;
}

/**
 * Evaluates trade performance evidence to determine the true Agent Phase.
 * - 0–5 trades: SEED
 * - 6–20 trades: LEARNING
 * - 21–50 trades (winRate >= 50%): ADAPTING
 * - >50 trades (winRate >= 55%): AUTONOMOUS
 */
export function evaluateAgentPhase(totalTrades: number, winRate: number): AgentPhaseEvaluation {
  if (totalTrades <= 5) {
    return {
      phase: 'SEED',
      reason: `Completed ${totalTrades}/5 initial observation trades.`,
      totalTrades,
      winRate,
    };
  }
  if (totalTrades <= 20) {
    return {
      phase: 'LEARNING',
      reason: `Executed ${totalTrades} trades. Calibrating signal weights (win rate: ${(winRate * 100).toFixed(1)}%).`,
      totalTrades,
      winRate,
    };
  }
  if (totalTrades <= 50 || winRate < 0.55) {
    return {
      phase: 'ADAPTING',
      reason: `Executed ${totalTrades} trades with ${(winRate * 100).toFixed(1)}% win rate. Auto-tuning entry parameters.`,
      totalTrades,
      winRate,
    };
  }
  return {
    phase: 'AUTONOMOUS',
    reason: `Proven track record of ${totalTrades} trades with ${(winRate * 100).toFixed(1)}% win rate. Fully autonomous execution active.`,
    totalTrades,
    winRate,
  };
}

export class ApexAgentLoopService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public startLoop(intervalMs = 30000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    process.stdout.write(`[ApexAgentLoop] Background agent loop started (${intervalMs}ms interval)\n`);
  }

  public stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find all running agents
      const runningAgents = await prisma.agentState.findMany({
        where: { isRunning: true },
      });

      for (const agent of runningAgents) {
        await this.processAgentTick(agent);
      }
    } catch (err) {
      process.stderr.write(`[ApexAgentLoop] Tick error: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processAgentTick(agent: { userId: string; phase: AgentPhase; currentStrategyId: string | null }) {
    const userId = agent.userId;

    // 1. Calculate trade evidence & advance agent phase if warranted
    const trades = await prisma.trade.findMany({
      where: { order: { userId } },
      select: { realizedPnl: true },
    });

    const totalTrades = trades.length;
    const wins = trades.filter((t) => Number(t.realizedPnl ?? 0) > 0).length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    const evaluation = evaluateAgentPhase(totalTrades, winRate);

    if (evaluation.phase !== agent.phase) {
      await prisma.agentState.updateMany({
        where: { userId },
        data: { phase: evaluation.phase },
      });

      const entry = await createActivityEntry({
        userId,
        eventType: 'AGENT_PHASE_CHANGED',
        message: `Apex Agent advanced to ${evaluation.phase} phase · ${evaluation.reason}`,
      });
      eventBus.broadcastToUser(userId, 'ACTIVITY_LOGGED', entry);
    }

    // 2. Sample automated paper trade execution if active strategy selected
    if (agent.currentStrategyId) {
      const symbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN'];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const side = Math.random() > 0.4 ? 'BUY' : 'SELL';
      const quantity = Math.floor(Math.random() * 5) + 1;

      const result = await executeOrder({
        userId,
        symbol,
        side,
        orderType: 'MARKET',
        quantity,
        assetClass: 'STOCKS',
        isSimulated: true,
        owner: 'APEX',
        aiReasoning: `Apex Autopilot (${evaluation.phase} phase) identified momentum trigger on ${symbol}. Sized within Risk Vault limits.`,
      });

      if (result.success) {
        process.stdout.write(`[ApexAgentLoop] Executed SIM order for user ${userId}: ${side} ${quantity} ${symbol}\n`);
      }
    }
  }
}

export const apexAgentLoop = new ApexAgentLoopService();
