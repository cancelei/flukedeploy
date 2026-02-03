# FlukeDeploy Architecture

**AI-Native PaaS for the FlukeBase Ecosystem**

Built on [CapRover](https://caprover.com) with enhanced logging, real-time streaming, and AI agent integration.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [API Reference](#api-reference)
- [Integration Points](#integration-points)
- [Deployment Lifecycle](#deployment-lifecycle)
- [Technology Stack](#technology-stack)

---

## Overview

FlukeDeploy is a fork of CapRover enhanced specifically for AI-native deployments in the FlukeBase ecosystem. Key improvements include:

- **JSON-LD Logging**: Structured logs optimized for AI consumption
- **WebSocket Streaming**: Real-time deployment updates (port 8767)
- **OPERATOR Integration**: Native support for AI agent deployments via MCP tools
- **Enhanced Lifecycle Tracking**: 5-phase deployment monitoring
- **FlukeBase Integration**: Automatic syncing with flukebase.me API

### Design Goals

1. **AI-Consumable Logs**: All deployment events in JSON-LD format with semantic metadata
2. **Real-Time Observability**: WebSocket streaming for live monitoring by agents
3. **Autonomous Deployments**: OPERATOR persona can deploy without human intervention
4. **Zero-Downtime**: Maintain CapRover's reliability while adding new features
5. **Backward Compatible**: Can still be used as a standard PaaS

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI Agents (OPERATOR)                        │
│                  via MCP Tools (flukebase_connect)              │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FlukeDeploy Backend                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ REST API (Express - Port 3000)                            │ │
│  │ • /api/v1/logs - Query logs with filters                 │ │
│  │ • /api/v1/deployments/:id - Get deployment status        │ │
│  │ • /api/v1/apps/:name/deployments - App history           │ │
│  │ • /api/v1/deployments/active - Active deployments        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ WebSocket Server (ws - Port 8767)                         │ │
│  │ • Real-time log streaming                                 │ │
│  │ • Client-side filtering (app_name, level, event_type)    │ │
│  │ • Subscribe/unsubscribe via JSON messages                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Deployment Lifecycle Tracker                              │ │
│  │ • DeploymentSession: Tracks 5 phases                      │ │
│  │ • DeploymentLifecycleTracker: Manages all deployments    │ │
│  │ • In-memory storage (active + recent 100)                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ FlukeBase Integration Client                              │ │
│  │ • Syncs logs to flukebase.me/api/v1                       │ │
│  │ • Updates WeDo tasks                                      │ │
│  │ • Real-time team notifications                            │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │ Docker API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Docker Swarm (Container Orchestration)             │
│  • Service management                                           │
│  • Rolling updates                                              │
│  • Health checks                                                │
│  • Load balancing                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Unified Logging Schema

**Location**: `src/logging/UnifiedSchema.ts`

Provides JSON-LD structured logging matching flukebase_connect's schema.

**Key Types**:
```typescript
// Event types for deployment lifecycle
enum FlukeDeployEventType {
    PRE_BUILD, BUILD_START, BUILD_COMPLETE, BUILD_ERROR,
    PRE_DEPLOY, DEPLOY_START, DEPLOY_COMPLETE, DEPLOY_ERROR,
    POST_DEPLOY, HEALTH_CHECK, SCALE_EVENT, CONFIG_CHANGE
}

// Unified log entry
interface UnifiedLogEntry {
    '@context': 'https://flukebase.me/schemas/unified-log'
    '@type': 'UnifiedLogEntry'
    id: string
    timestamp: string  // ISO 8601
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    source: LogSource
    flukedeploy_metadata: FlukeDeployMetadata
}
```

**Helper Functions**:
- `createDeploymentLog()` - Create structured log
- `createErrorLog()` - Create error log with stack trace
- `createHealthCheckLog()` - Create health check log
- `createScaleLog()` - Create scaling event log

### 2. Deployment Lifecycle Tracker

**Location**: `src/logging/DeploymentTracker.ts`

Tracks deployments through 5 phases with timing and error handling.

**Classes**:
- `DeploymentSession` - Single deployment tracking
- `DeploymentLifecycleTracker` - Manages multiple deployments
- `globalDeploymentTracker` - Singleton instance

**Phases**:
1. **pre_build**: Pre-build hooks, validation
2. **build**: Docker image build
3. **pre_deploy**: Pre-deployment checks
4. **deploy**: Deployment to swarm
5. **post_deploy**: Post-deployment hooks, health checks

**Status Flow**:
```
pending → building → deploying → success
                              ↘ failed → rolled_back
```

### 3. REST API

**Location**: `src/api/LogsAPI.ts`

Express routes for querying logs and deployment status.

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/logs` | Query logs with filters |
| GET | `/api/v1/deployments/:id` | Get deployment status |
| GET | `/api/v1/deployments/:id/logs` | Get deployment logs by phase |
| GET | `/api/v1/apps/:name/deployments` | Get app deployment history |
| GET | `/api/v1/deployments/active` | Get all active deployments |
| GET | `/api/v1/deployments/stats` | Get tracker statistics |

**Query Parameters** (for `/api/v1/logs`):
- `app_name`: Filter by application
- `deployment_id`: Filter by deployment
- `level`: Filter by log level
- `event_type`: Filter by event type
- `since_minutes`: Time window (default: 60)
- `limit`: Max logs (default: 1000)
- `offset`: Pagination offset

### 4. WebSocket Server

**Location**: `src/logging/WebSocketServer.ts`

Real-time log streaming on port 8767.

**Features**:
- Client subscription with filters
- Real-time log broadcasting
- Keepalive ping/pong
- Connection statistics

**Client Protocol**:
```javascript
// Connect with URL params
ws://localhost:8767?app_name=myapp&level=info

// Or send subscribe message
{
  "action": "subscribe",
  "filter": {
    "app_name": "myapp",
    "deployment_id": "dep-123",
    "level": "info",
    "event_type": "build_start"
  }
}

// Receive logs
{
  "@context": "https://flukebase.me/schemas/unified-log",
  "@type": "UnifiedLogEntry",
  "id": "dep-123-log-001",
  "timestamp": "2026-02-03T10:00:00Z",
  "level": "info",
  "message": "Build started",
  ...
}
```

### 5. FlukeBase Integration Client

**Location**: `src/integrations/FlukeBaseClient.ts`

Syncs deployment data with flukebase.me API.

**Methods**:
- `syncDeploymentLog()` - Sync single log entry
- `syncDeploymentLogsBatch()` - Sync multiple logs
- `updateWedoTask()` - Update WeDo task status
- `createDeploymentTask()` - Create WeDo task for deployment
- `syncDeploymentSummary()` - Sync complete deployment summary

**Configuration** (via environment variables):
```bash
FLUKEBASE_API_URL=https://flukebase.me/api/v1
FLUKEBASE_API_TOKEN=fbk_...
```

---

## Data Flow

### Deployment Flow

```
1. OPERATOR calls deploy_app MCP tool
   ↓
2. flukebase_connect sends HTTP POST to FlukeDeploy
   ↓
3. FlukeDeploy creates DeploymentSession
   ↓
4. For each phase:
   a. startPhase() → emits BUILD_START/DEPLOY_START log
   b. Execute phase (Docker build, service update, etc.)
   c. completePhase() → emits BUILD_COMPLETE/BUILD_ERROR log
   d. Broadcast log to WebSocket clients
   e. Sync log to FlukeBase API
   ↓
5. Update WeDo task with deployment results
   ↓
6. Move deployment to completed history
```

### Log Flow

```
Deployment Event
  ↓
createDeploymentLog()
  ↓
DeploymentSession.addLog()
  ↓
┌─────────────┬──────────────┬──────────────┐
│             │              │              │
▼             ▼              ▼              ▼
WebSocket    REST API     FlukeBase    In-Memory
Broadcast    /logs        API Sync     Storage
(port 8767)  (port 3000)  (HTTP)       (100 recent)
```

---

## API Reference

### MCP Tools (via flukebase_connect)

Located in: `flukebase_connect/tools/deployment/`

**Available Tools**:

```python
# Deploy application
deploy_app(
    app_name="api-server",
    image="myorg/api:v1.2.3",
    replicas=3,
    strategy="rolling",
    validation_level="strict",
    auto_rollback=True
)

# Check status
deploy_status(deployment_id="dep-123")

# Stream logs
deploy_logs(
    app_name="api-server",
    follow=True
)

# Rollback
deploy_rollback(
    app_name="api-server",
    version="v1.2.2",
    reason="High error rate"
)

# Validate before deploying
deploy_validate(
    app_name="api-server",
    environment="production",
    run_tests=True,
    run_security_scan=True
)

# View history
deploy_history(
    app_name="api-server",
    limit=10
)
```

### REST API Examples

```bash
# Query logs
curl "http://localhost:3000/api/v1/logs?app_name=myapp&level=error&limit=100"

# Get deployment status
curl "http://localhost:3000/api/v1/deployments/dep-123"

# Get deployment logs by phase
curl "http://localhost:3000/api/v1/deployments/dep-123/logs"

# Get app deployment history
curl "http://localhost:3000/api/v1/apps/myapp/deployments?limit=5"

# Get active deployments
curl "http://localhost:3000/api/v1/deployments/active"

# Get tracker stats
curl "http://localhost:3000/api/v1/deployments/stats"
```

### WebSocket Examples

```bash
# Using wscat
wscat -c "ws://localhost:8767?app_name=myapp"

# Subscribe to specific deployment
wscat -c ws://localhost:8767
> {"action": "subscribe", "filter": {"deployment_id": "dep-123"}}

# Get server stats
> {"action": "get_stats"}

# Keepalive
> {"action": "ping"}
```

---

## Integration Points

### With FlukeBase API

**Base URL**: `https://flukebase.me/api/v1`

**Endpoints Used**:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/flukebase_connect/deployment_logs` | Sync single log |
| POST | `/flukebase_connect/deployment_logs/batch` | Sync multiple logs |
| POST | `/flukebase_connect/wedo_tasks` | Create WeDo task |
| PATCH | `/flukebase_connect/wedo_tasks/:id` | Update task status |
| POST | `/flukebase_connect/deployments` | Sync deployment summary |

**Authentication**:
```bash
Authorization: Bearer fbk_your_token_here
```

### With flukebase_connect MCP Server

**Tools Location**: `flukebase_connect/tools/deployment/`

**Handler Pattern**:
```python
async def handle_deploy_app(args: dict, ctx: ServiceContext) -> dict:
    # 1. Extract args
    app_name = args["app_name"]

    # 2. Call FlukeDeploy API
    response = requests.post(
        "http://localhost:3000/api/v1/deploy",
        json={...}
    )

    # 3. Return deployment_id
    return {"deployment_id": "dep-123", ...}
```

---

## Deployment Lifecycle

### Phase Progression

```
Phase 1: pre_build (optional)
├─ Run pre-build hooks
├─ Validate source code
└─ Check dependencies
   ↓
Phase 2: build
├─ Pull base image
├─ Execute Dockerfile
├─ Tag image
└─ Push to registry
   ↓
Phase 3: pre_deploy (optional)
├─ Run validation tests
├─ Security scans
└─ Quality gates
   ↓
Phase 4: deploy
├─ Create/update Docker service
├─ Rolling update (default)
├─ Monitor replica health
└─ Wait for readiness
   ↓
Phase 5: post_deploy (optional)
├─ Run post-deploy hooks
├─ Health checks
├─ Smoke tests
└─ Notify team
```

### Event Timeline

```
00:00 - DEPLOY_START
00:01 - PRE_BUILD
00:05 - BUILD_START
01:30 - BUILD_COMPLETE
01:31 - PRE_DEPLOY
01:35 - DEPLOY_START
02:00 - HEALTH_CHECK (healthy)
02:05 - DEPLOY_COMPLETE
02:06 - POST_DEPLOY
02:10 - Deployment SUCCESS
```

### Error Handling & Rollback

**Auto-Rollback Triggers**:
- Build failure
- Pre-deploy validation failure
- Deployment timeout
- Health check failure
- Replica startup failure

**Rollback Process**:
1. Mark current deployment as `failed`
2. Identify previous successful deployment
3. Create rollback deployment session
4. Deploy previous version
5. Update WeDo task with rollback reason
6. Notify team via FlukeBase

---

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **WebSocket**: ws library
- **HTTP Client**: axios
- **Container**: Docker + Docker Swarm

### Logging
- **Format**: JSON-LD (Linked Data)
- **Schema**: Unified log entry with semantic metadata
- **Storage**: In-memory (100 recent deployments)
- **Streaming**: WebSocket (port 8767)

### Integration
- **FlukeBase API**: REST (HTTPS)
- **MCP Tools**: flukebase_connect
- **WeDo Protocol**: Task orchestration
- **Agent Auth**: OPERATOR persona

---

## Port Assignments

| Port | Service | Purpose |
|------|---------|---------|
| 80 | Nginx | HTTP traffic |
| 443 | Nginx | HTTPS traffic |
| 3000 | Express | REST API, Web UI |
| 8767 | WebSocket | Log streaming |
| 7946 | Docker Swarm | Container discovery |

**Note**: Port 8767 was chosen to avoid conflict with flukebase_connect's WebSocket server on 8766.

---

## Performance Characteristics

### Scalability
- **Active Deployments**: Unlimited (in-memory tracking)
- **History**: 100 most recent deployments cached
- **WebSocket Clients**: No hard limit (depends on server resources)
- **Log Entries**: ~1000 per deployment average

### Latency
- **REST API**: <50ms (in-memory queries)
- **WebSocket Broadcast**: <10ms (no processing)
- **FlukeBase Sync**: 100-500ms (network dependent)
- **Deployment**: 1-5 minutes (Docker build + deploy)

---

## Security

### Authentication
- **REST API**: Inherits CapRover's auth system
- **WebSocket**: No auth (internal network only)
- **FlukeBase API**: Bearer token (FLUKEBASE_API_TOKEN)
- **MCP Tools**: OPERATOR persona capability check

### Network Isolation
- WebSocket server binds to localhost by default
- Can be configured for external access with auth

### Secrets Management
- Environment variables for sensitive data
- No secrets in logs (masked in FlukeBaseClient)
- API tokens never logged

---

## Future Enhancements

### Week 2-4
- [ ] Production deployment to flukebase.me
- [ ] UI dashboard for deployment monitoring
- [ ] Advanced strategies (blue-green, canary)

### Month 2
- [ ] Persistent storage (PostgreSQL)
- [ ] Metrics API with Prometheus format
- [ ] Alerting and incident management

### Month 3
- [ ] Multi-project orchestration
- [ ] Service mesh integration
- [ ] Auto-scaling based on load

---

## References

- **CapRover Upstream**: https://github.com/caprover/caprover
- **FlukeBase**: https://flukebase.me
- **MCP Tools**: `../flukebase-ecosystem/projects/flukebase_connect/flukebase_connect/tools/deployment/`
- **JSON-LD**: https://json-ld.org/

---

**Version**: 1.0.0
**Status**: Implementation Complete
**Next**: End-to-End Testing
