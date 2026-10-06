import { buildApp } from './app.js';
import { config } from './config/index.js';
import { apexAgentLoop } from './lib/agent/apex_agent_loop.js';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`QuantroApex API Gateway running on http://${config.host}:${config.port}`);
    apexAgentLoop.startLoop(30000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    apexAgentLoop.stopLoop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
