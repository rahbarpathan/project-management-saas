# Real-Time Updates, Presence, and Horizontal Scaling

## 1. Overview

SprintFlow utilizes Socket.IO for real-time collaboration across project boards and task views.
Clients receive instantaneous updates for task mutations, comments, and member presence without polling.

### Key Architecture Components

- **Authentication**: Sockets authenticate during the initial handshake using the `access_token` httpOnly cookie (or `socket.handshake.auth.token` fallback). Unauthenticated sockets are immediately rejected.
- **Project Isolation & Authorization**: Sockets join rooms using the format `project:{projectId}`. Before a socket is allowed to join, the API verifies workspace membership. Non-members are rejected with an authorization error.
- **Post-Commit Emission Invariant**: Socket events are strictly emitted *after* the PostgreSQL transaction commits. If a database transaction fails or rolls back, no event is emitted.
- **Deduplication & Concurrency Control**: Every event contains a unique `eventId` (UUID), `entityId`, and the entity's `version`. The client maintains a processed event cache to discard duplicate broadcasts and verifies `event.version > cached.version` before updating local state to prevent out-of-order race conditions.
- **Resync on Reconnection**: Upon socket disconnect and subsequent reconnection, the client automatically re-joins the project room and invalidates TanStack Query caches to resync any state changes missed during the disconnect window.

---

## 2. Event Payload Schema

All real-time events conform to standard interfaces defined in `@sprintflow/shared`:

```typescript
export interface BaseRealtimeEvent {
  eventId: string;     // Unique UUID for idempotency & deduplication
  projectId: string;   // Project room identifier
  entityId: string;    // ID of the mutated entity (task, comment)
  version: number;     // Monotonically increasing version number
}
```

Supported event types emitted to `project:{projectId}`:
1. `task:created` - Full `TaskResponse` payload with `version: 1`
2. `task:updated` - Updated `TaskResponse` payload with incremented `version`
3. `task:moved` - Moved `TaskResponse` payload with updated `position`, `status`, and `version`
4. `task:deleted` - `entityId` and `version` of deleted task
5. `comment:created` - Full `CommentResponse` payload and parent `taskId`
6. `presence:update` - Array of `PresenceUser`s actively viewing the project

---

## 3. Scaling to Multiple API Instances (Socket.IO Redis Adapter)

In single-instance deployments, Socket.IO manages rooms and broadcasts in memory. When scaling horizontally across multiple Node.js instances behind a reverse proxy (e.g., NGINX, AWS ALB, Traefik), two requirements arise:
1. **Cross-instance room broadcasting**: Sockets connected to Instance A must receive events published by mutations processed on Instance B.
2. **Session stickiness**: If using HTTP long-polling fallback, requests from the same client session must route to the same instance (or use WebSocket-only transport).

### Step 1: Install Adapter Packages

```bash
pnpm --filter @sprintflow/api add @socket.io/redis-adapter ioredis
pnpm --filter @sprintflow/api add -D @types/ioredis
```

### Step 2: Configure Redis Adapter in `SocketService`

Update `apps/api/src/modules/socket/socket.service.ts`:

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { getEnv } from '../../config/env';

export class SocketService {
  private io: SocketIOServer | null = null;

  public init(httpServer: HttpServer): SocketIOServer {
    const env = getEnv();

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [env.CLIENT_URL, 'http://localhost:5173'],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 10000,
    });

    // Setup Redis Adapter if REDIS_URL is configured
    if (env.REDIS_URL) {
      const pubClient = new Redis(env.REDIS_URL);
      const subClient = pubClient.duplicate();

      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis Adapter attached for multi-instance broadcasting');
    }

    // ... attach auth middleware and event handlers
    return this.io;
  }
}
```

### Step 3: Multi-Instance Presence Management

In multi-instance setups, local `Map` presence tracking can be replaced with Redis sets:
- When a user joins `project:{id}`:
  `redis.sadd(`presence:project:${projectId}`, JSON.stringify(user))`
  `redis.expire(`presence:project:${projectId}`, 60)` (with heartbeat refresh)
- When a user leaves or disconnects:
  `redis.srem(`presence:project:${projectId}`, JSON.stringify(user))`
- On presence change:
  Instance fetches `redis.smembers(`presence:project:${projectId}`)` and emits `presence:update` to the room via the Redis adapter.

### Step 4: Reverse Proxy Configuration (Session Sticky Routing)

If HTTP long-polling transport is permitted, configure cookie-based sticky sessions on your reverse proxy:

**NGINX Example**:
```nginx
upstream socket_nodes {
    ip_hash; # Sticky routing based on client IP
    server api-1:4000;
    server api-2:4000;
}

server {
    listen 80;
    server_name api.sprintflow.dev;

    location /socket.io/ {
        proxy_pass http://socket_nodes;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Alternatively, configure the client to use WebSocket transport exclusively (`transports: ['websocket']`), avoiding the HTTP long-polling handshake entirely.
