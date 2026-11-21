import { buildApp } from './app.js';
import { config } from './config/index.js';
import { apexAgentLoop } from './lib/agent/apex_agent_loop.js';
import {
  reconcilePendingSubmitOrders,
  syncAllPortfoliosMarkToMarket,
  fillPendingSimLimitOrders,
  pruneOldEquitySnapshots,
} from './lib/execution_engine.js';

async function main() {
  const app = await buildApp();

  let reconcileTimer: NodeJS.Timeout | null = null;
  let mtmTimer: NodeJS.Timeout | null = null;
  let simOrdersTimer: NodeJS.Timeout | null = null;
  let snapshotPruneTimer: NodeJS.Timeout | null = null;

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`QuantroApex API Gateway running on http://${config.host}:${config.port}`);
    apexAgentLoop.startLoop(30000);

    // Periodic reconciliation job (every 60s)
    reconcileTimer = setInterval(() => {
      reconcilePendingSubmitOrders().catch((err) => {
        app.log.error(err, 'Failed to run PENDING_SUBMIT order reconciliation');
      });
    }, 60000);

    // Periodic mark-to-market sync (every 5 min)
    mtmTimer = setInterval(() => {
      syncAllPortfoliosMarkToMarket().catch((err) => {
        app.log.error(err, 'Failed to run mark-to-market portfolio sync');
      });
    }, 300000);

    // Periodic SIM pending limit orders job (every 15s for crypto, stocks during market hours)
    simOrdersTimer = setInterval(() => {
      fillPendingSimLimitOrders().catch((err) => {
        app.log.error(err, 'Failed to fill pending SIM limit orders');
      });
    }, 15000);

    // Nightly equity snapshots retention job (keeps daily snapshots forever, prunes 5-min snapshots older than 7 days)
    pruneOldEquitySnapshots().catch((err) => {
      app.log.error(err, 'Failed to run initial snapshot retention pruning');
    });
    snapshotPruneTimer = setInterval(() => {
      pruneOldEquitySnapshots().catch((err) => {
        app.log.error(err, 'Failed to run nightly snapshot retention pruning');
      });
    }, 86_400_000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (mtmTimer) clearInterval(mtmTimer);
    if (simOrdersTimer) clearInterval(simOrdersTimer);
    if (snapshotPruneTimer) clearInterval(snapshotPruneTimer);
    apexAgentLoop.stopLoop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
