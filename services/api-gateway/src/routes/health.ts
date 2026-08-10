import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { eventBus } from '../lib/events/event_bus.js';
import { defaultBrokerClient } from '../lib/broker/alpaca_client.js';

export async function healthRoutes(app: FastifyInstance) {
  // Liveness probe — fast check for container orchestrators (Kubernetes/Docker)
  app.get('/health', async () => ({
    status: 'ok',
    service: 'quantroapex-api-gateway',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/live', async () => ({
    status: 'ALIVE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // Readiness probe — checks if database and core services are connected
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({
        status: 'READY',
        database: 'CONNECTED',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({
        status: 'NOT_READY',
        database: 'DISCONNECTED',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Detailed subsystem breakdown for ops & admin dashboards
  app.get('/health/detailed', async (_request, reply) => {
    let dbStatus = 'HEALTHY';
    let dbLatencyMs = 0;

    const startDb = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startDb;
    } catch {
      dbStatus = 'UNHEALTHY';
    }

    let brokerStatus = 'SIMULATION_MODE';
    try {
      const brokerAcc = await defaultBrokerClient.getAccount();
      if (brokerAcc.id !== 'mock_paper_account') {
        brokerStatus = 'CONNECTED_SANDBOX';
      }
    } catch {
      brokerStatus = 'ERROR';
    }

    const memory = process.memoryUsage();

    const isHealthy = dbStatus === 'HEALTHY';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      subsystems: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
        broker: { status: brokerStatus },
        eventBus: { activeConnections: eventBus.connectionCount },
      },
      memoryUsage: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
