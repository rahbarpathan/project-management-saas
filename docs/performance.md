# SprintFlow Performance & Load Testing Report

Real performance measurements gathered using **Autocannon** load generator.

## Test Environment
- **Host**: Intel / AMD Multi-Core (Windows 64-bit)
- **Node.js**: v22
- **Network**: Local loopback (127.0.0.1)
- **Concurrency**: 50 concurrent connections
- **Duration**: 5 seconds per scenario
- **Pipelining**: 1 request per pipeline

---

## Scenario 1: Unauthenticated Health Check (`GET /health`)
This endpoint verifies container and process health (used by Docker and Kubernetes probes).

| Metric | Measured Value |
|---|---|
| **Average Latency** | 4.92 ms |
| **p50 (Median)** | 4.0 ms |
| **p90** | 12.0 ms |
| **p99** | 27.0 ms |
| **Max Latency** | 49.0 ms |
| **Throughput (Requests/sec)** | 9,233 req/s |
| **Total Requests Processed** | 46,162 requests |
| **Total Transferred** | 15.10 MB |
| **Errors / Timeouts** | 0 errors, 0 timeouts |

---

## Scenario 2: Authenticated Project Tasks (`GET /api/projects/:id/tasks`)
Simulates heavy concurrent read traffic from multi-user Kanban board loading with JWT cookie authentication, tenant verification, and JSON payload serialization.

| Metric | Measured Value |
|---|---|
| **Average Latency** | 32.08 ms |
| **p50 (Median)** | 32.0 ms |
| **p90** | 44.0 ms |
| **p99** | 54.0 ms |
| **Max Latency** | 71.0 ms |
| **Throughput (Requests/sec)** | 1,530 req/s |
| **Total Requests Processed** | 7,650 requests |
| **Total Transferred** | 15.61 MB |
| **Errors / Timeouts** | 0 errors, 0 timeouts |

---

## Performance Observations & Architecture Insights
1. **Low Latencies Under High Load**:
   - The health endpoint delivers **9,233 req/s** with sub-5ms median latency.
   - The authenticated tasks endpoint delivers **1,530 req/s** with a p90 latency of 44 ms and median 32 ms, confirming minimal middleware overhead from JWT signature verification and JSON serialization.
2. **Zero Errors or Dropped Connections**:
   - Across both scenarios with 50 persistent TCP sockets, 0 HTTP connection errors and 0 timeouts were recorded.
3. **Scaling Beyond a Single Node**:
   - As documented in [deployment.md](./deployment.md), when scaling SprintFlow horizontally across multiple containers, Socket.IO rooms should be coordinated using `@socket.io/redis-adapter` and database connections should be pooled via PgBouncer.
