<div align="center">
<h1>FlukeDeploy</h1>
<p><strong>AI-Native PaaS for the FlukeBase Ecosystem</strong></p>

Easiest app/database deployment platform with enhanced logging and AI agent integration.

Built on Docker Swarm. No Docker or nginx knowledge required!

</div>

## What's this?

FlukeDeploy is an **AI-native Platform-as-a-Service** forked from [CapRover](https://caprover.com) with enhancements for the FlukeBase ecosystem:

- ✅ **JSON-LD Logging**: Structured logs optimized for AI consumption
- ✅ **WebSocket Streaming**: Real-time deployment updates
- ✅ **OPERATOR Integration**: Native support for AI agent deployments
- ✅ **Enhanced Validation**: Pre-deployment security scans and quality gates
- ✅ **Lifecycle Tracking**: 5-phase deployment monitoring (pre_build → build → pre_deploy → deploy → post_deploy)

### Core Features (inherited from CapRover)

✔ CLI for automation and scripting

✔ Web GUI for ease of access and convenience

✔ No lock-in! Remove FlukeDeploy and your apps keep working!

✔ Docker Swarm under the hood for containerization and clustering

✔ Nginx (fully customizable template) under the hood for load-balancing

✔ Let's Encrypt under the hood for free SSL (HTTPS)

### Who should care about FlukeDeploy?

- **AI Agents**: OPERATOR persona can deploy autonomously with full lifecycle tracking
- **Web Developers**: Who don't like spending hours setting up servers and build tools
- **Cost-Conscious Teams**: Reduce hosting costs by 50x compared to Heroku/Azure
- **FlukeBase Users**: Native integration with WeDo protocol and memory system
- **DevOps Engineers**: Who want deployment observability optimized for AI analysis

## FlukeDeploy vs CapRover

| Feature | CapRover | FlukeDeploy |
|---------|----------|-------------|
| CLI log viewing | ❌ No | ✅ Yes (WebSocket + REST) |
| Structured logging | ❌ Docker only | ✅ JSON-LD format |
| Agent authentication | ❌ No | ✅ OPERATOR persona |
| Deployment webhooks | ❌ No | ✅ Yes (lifecycle events) |
| API documentation | ❌ Unstable | ✅ OpenAPI/Swagger |
| Metrics API | ❌ NetData only | ✅ REST endpoints |
| Pre/Post hooks | ⚠️ Pre-deploy only | ✅ Full lifecycle |

## Quick Start

### Prerequisites

- A Linux server (or DigitalOcean, Hetzner, AWS, etc.)
- Docker installed
- A domain name (optional, for SSL)

### Installation

```bash
docker run -p 80:80 -p 443:443 -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v /captain:/captain flukebase/flukedeploy
```

### MCP Tools (OPERATOR Persona)

```python
# Deploy from OPERATOR agent
deploy_app(
    app_name="api-server",
    image="myorg/api:v1.2.3",
    replicas=3,
    strategy="rolling",
    validation_level="strict"
)

# Monitor deployment
status = deploy_status(deployment_id="dep-123")

# Stream logs in real-time
logs = deploy_logs(app_name="api-server", follow=True)
```

See [MCP Tools Documentation](../flukebase-ecosystem/projects/flukebase_connect/flukebase_connect/tools/deployment/README.md) for full API.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│         FlukeDeploy (TypeScript + Node.js)              │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ REST API         │  │ WebSocket Server │            │
│  │ Express          │  │ Port 8767        │            │
│  │ Port 3000        │  │ JSON-LD Logs     │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ DeploymentLifecycleTracker                       │  │
│  │ • 5-phase tracking                               │  │
│  │ • Auto-rollback                                  │  │
│  │ • Health checks                                  │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Docker Swarm                               │
└─────────────────────────────────────────────────────────┘
```

## JSON-LD Logging

FlukeDeploy emits deployment logs in JSON-LD format:

```json
{
  "@context": "https://flukebase.me/schemas/unified-log",
  "@type": "UnifiedLogEntry",
  "timestamp": "2026-02-03T10:00:00Z",
  "level": "info",
  "message": "Build phase started",
  "caprover_metadata": {
    "event_type": "build_start",
    "app_name": "api-server",
    "deployment_id": "dep-123",
    "version": "v1.2.3"
  }
}
```

Event types: `pre_build`, `build_start`, `build_complete`, `deploy_start`, `deploy_complete`, `health_check`, `scale_event`, `config_change`, and more.

## FlukeBase Integration

- **Logs**: Auto-sync to `/api/v1/flukebase_connect/deployment_logs`
- **Tasks**: WeDo task updates via `/api/v1/flukebase_connect/wedo_tasks/:id`
- **Memory**: Store deployment patterns and gotchas
- **Real-time**: Team notifications via WebSocket broadcast

## Documentation

- **Getting Started**: [Installation Guide](docs/getting-started.md) *(coming soon)*
- **API Reference**: [REST API Documentation](docs/api-reference.md) *(coming soon)*
- **MCP Tools**: [flukebase_connect/tools/deployment/README.md](../flukebase-ecosystem/projects/flukebase_connect/flukebase_connect/tools/deployment/README.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md) *(coming soon)*

## Learn More about CapRover

This project is a fork of [CapRover](https://caprover.com), an excellent open-source PaaS.

For CapRover documentation, visit:
- **Website**: https://caprover.com
- **GitHub**: https://github.com/caprover/caprover
- **Docs**: https://caprover.com/docs

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Same as CapRover - see [LICENSE](LICENSE)

## Acknowledgments

**FlukeDeploy** is built on the excellent work of the [CapRover](https://github.com/caprover/caprover) project and its contributors. We are grateful for their open-source contribution to the community.

Key enhancements:
- JSON-LD structured logging
- WebSocket real-time streaming
- OPERATOR persona integration
- Enhanced deployment lifecycle tracking
- Pre-deployment validation gates
- FlukeBase API integration

---

**Upstream**: [CapRover](https://github.com/caprover/caprover)
**FlukeDeploy**: Enhanced for AI-native deployments in the FlukeBase ecosystem
