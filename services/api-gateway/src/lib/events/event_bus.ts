import { WebSocket } from 'ws';

export interface EventPayload {
  type: string;
  data: any;
  timestamp: string;
}

const MAX_CONNECTIONS_PER_USER = 5;
const STALE_SOCKET_CLEANUP_INTERVAL_MS = 30_000;

export class EventBus {
  private static instance: EventBus;
  private connections: Map<string, Set<WebSocket>> = new Map();

  private constructor() {
    // Periodically remove stale (closed/closing) sockets to prevent memory leaks
    setInterval(() => {
      this.connections.forEach((sockets, userId) => {
        sockets.forEach((socket) => {
          if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            sockets.delete(socket);
          }
        });
        if (sockets.size === 0) {
          this.connections.delete(userId);
        }
      });
    }, STALE_SOCKET_CLEANUP_INTERVAL_MS).unref(); // .unref() so it doesn't block process exit
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public registerClient(userId: string, socket: WebSocket): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    const userSockets = this.connections.get(userId)!;

    // Enforce maximum concurrent connections per user
    if (userSockets.size >= MAX_CONNECTIONS_PER_USER) {
      socket.close(1008, 'Too many concurrent connections for this account');
      return;
    }

    userSockets.add(socket);

    // Clean up on all socket lifecycle events
    socket.on('close', () => this.removeClient(userId, socket));
    socket.on('error', () => this.removeClient(userId, socket));
  }

  public removeClient(userId: string, socket: WebSocket): void {
    const userSockets = this.connections.get(userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.connections.delete(userId);
      }
    }
  }

  public broadcastToUser(userId: string, type: string, data: any): void {
    const userSockets = this.connections.get(userId);
    if (!userSockets || userSockets.size === 0) return;

    const payload: EventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(payload);
    userSockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }

  /**
   * Broadcasts to ALL connected users. Use sparingly — O(n) across all users.
   * Only appropriate for system-wide announcements.
   */
  public broadcastAll(type: string, data: any): void {
    const payload: EventPayload = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(payload);
    this.connections.forEach((sockets) => {
      sockets.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      });
    });
  }

  /** Returns the total number of active connections across all users. */
  public get connectionCount(): number {
    let count = 0;
    this.connections.forEach((s) => (count += s.size));
    return count;
  }
}

export const eventBus = EventBus.getInstance();
