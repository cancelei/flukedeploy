# FlukeDeploy AI-Native Enhancements

**Goal**: Make FlukeDeploy fully autonomous for AI agents
**Approach**: Enhance current fork with installation, management, and self-healing

---

## Phase 1: Installation Automation

### 1.1 One-Command Install Script

**File**: `install-flukedeploy.sh`

```bash
#!/bin/bash
# AI-friendly installation script
# Usage: curl -sSL https://get.flukedeploy.com | sudo bash
# Or: ./install-flukedeploy.sh --domain deploy.example.com --email admin@example.com

set -e

# Parse arguments
DOMAIN=""
EMAIL=""
HTTPS_ENABLED="true"
AUTO_GENERATE_PASSWORD="true"
ADMIN_PASSWORD=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain) DOMAIN="$2"; shift 2 ;;
        --email) EMAIL="$2"; shift 2 ;;
        --no-https) HTTPS_ENABLED="false"; shift ;;
        --password) ADMIN_PASSWORD="$2"; AUTO_GENERATE_PASSWORD="false"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Install prerequisites
install_prerequisites() {
    echo "📦 Installing prerequisites..."

    # Docker
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com | sh
    fi

    # Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi

    # Initialize Swarm if needed
    if ! docker node ls &> /dev/null; then
        docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')
    fi
}

# Generate admin credentials
generate_credentials() {
    if [ "$AUTO_GENERATE_PASSWORD" = "true" ]; then
        ADMIN_PASSWORD=$(openssl rand -base64 32)
        echo "🔐 Generated admin password: $ADMIN_PASSWORD"
        echo "$ADMIN_PASSWORD" > /root/.flukedeploy-admin-password
        chmod 600 /root/.flukedeploy-admin-password
    fi
}

# Create configuration
create_config() {
    cat > /root/flukedeploy-config.json <<EOF
{
    "domain": "${DOMAIN:-localhost}",
    "email": "${EMAIL:-admin@localhost}",
    "https_enabled": ${HTTPS_ENABLED},
    "admin_password_hash": "$(echo -n $ADMIN_PASSWORD | sha256sum | cut -d' ' -f1)",
    "websocket_port": 8767,
    "enable_json_ld_logging": true,
    "flukebase_integration": {
        "enabled": false,
        "api_url": "https://flukebase.me/api/v1"
    }
}
EOF
}

# Deploy FlukeDeploy
deploy_flukedeploy() {
    echo "🚀 Deploying FlukeDeploy..."

    # Pull image
    docker pull flukebase/flukedeploy:latest

    # Create data directories
    mkdir -p /flukedeploy/data/nginx
    mkdir -p /flukedeploy/data/config
    mkdir -p /flukedeploy/data/shared-logs

    # Deploy as Docker service
    docker service create \
        --name flukedeploy \
        --publish 80:80 \
        --publish 443:443 \
        --publish 3000:3000 \
        --publish 8767:8767 \
        --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
        --mount type=bind,src=/flukedeploy,dst=/flukedeploy \
        --env "FLUKEDEPLOY_ROOT_DOMAIN=${DOMAIN}" \
        --env "FLUKEDEPLOY_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
        --constraint 'node.role==manager' \
        flukebase/flukedeploy:latest
}

# Wait for service to be ready
wait_for_service() {
    echo "⏳ Waiting for FlukeDeploy to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/v1/health &> /dev/null; then
            echo "✅ FlukeDeploy is ready!"
            return 0
        fi
        sleep 2
    done
    echo "❌ FlukeDeploy failed to start"
    return 1
}

# Print success message
print_success() {
    cat <<EOF

✅ FlukeDeploy Installation Complete!

🌐 Access URLs:
   Web UI: http://${DOMAIN:-localhost}:3000
   API: http://${DOMAIN:-localhost}:3000/api/v1
   WebSocket: ws://${DOMAIN:-localhost}:8767

🔐 Admin Credentials:
   Username: admin
   Password: $ADMIN_PASSWORD
   (saved to /root/.flukedeploy-admin-password)

📚 Next Steps:
   1. Access the web UI at http://${DOMAIN:-localhost}:3000
   2. Complete initial setup
   3. Deploy your first app!

📖 Documentation: https://docs.flukedeploy.com

EOF
}

# Main installation flow
main() {
    echo "🎯 FlukeDeploy Installation Starting..."
    install_prerequisites
    generate_credentials
    create_config
    deploy_flukedeploy
    wait_for_service && print_success
}

main
```

### 1.2 Installation MCP Tool

**File**: `flukebase_connect/tools/deployment/installer.py`

```python
async def handle_flukedeploy_install(args: dict, ctx: ServiceContext) -> dict:
    """Install FlukeDeploy on a fresh VPS.

    Args:
        vps_host: SSH hostname (from ~/.ssh/config)
        domain: Optional domain name
        email: Admin email for Let's Encrypt
        enable_https: Enable HTTPS with Let's Encrypt
        admin_password: Optional admin password (auto-generated if not provided)

    Returns:
        Installation status, credentials, and access URLs
    """
    vps_host = args["vps_host"]
    domain = args.get("domain", "localhost")
    email = args.get("email", "admin@localhost")
    enable_https = args.get("enable_https", True)
    admin_password = args.get("admin_password")

    # Upload installation script
    ssh_client = SSHClient(vps_host)
    ssh_client.upload_file("install-flukedeploy.sh", "/tmp/install-flukedeploy.sh")

    # Build command
    cmd = "/bin/bash /tmp/install-flukedeploy.sh"
    cmd += f" --domain {domain}"
    cmd += f" --email {email}"
    if not enable_https:
        cmd += " --no-https"
    if admin_password:
        cmd += f" --password {admin_password}"

    # Execute installation
    result = ssh_client.execute(cmd, timeout=600)

    # Extract credentials from output
    credentials = {
        "username": "admin",
        "password": result.extract_password(),
        "saved_to": "/root/.flukedeploy-admin-password"
    }

    return {
        "status": "success",
        "installation_id": f"install-{int(time.time())}",
        "vps_host": vps_host,
        "domain": domain,
        "credentials": credentials,
        "urls": {
            "web_ui": f"http://{domain}:3000",
            "api": f"http://{domain}:3000/api/v1",
            "websocket": f"ws://{domain}:8767"
        },
        "next_steps": [
            "Access the web UI to complete setup",
            "Configure FlukeBase integration (optional)",
            "Deploy your first application"
        ]
    }
```

---

## Phase 2: Management APIs

### 2.1 Health API

**File**: `src/api/HealthAPI.ts`

```typescript
/**
 * Health and status monitoring API
 */

import express = require('express')
import { execSync } from 'child_process'
import os = require('os')

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    uptime_seconds: number
    timestamp: string
    version: string

    system: {
        cpu_usage_percent: number
        memory_used_percent: number
        disk_used_percent: number
        load_average: number[]
    }

    docker: {
        swarm_healthy: boolean
        manager_node: boolean
        services_count: number
        containers_running: number
    }

    flukedeploy: {
        apps_deployed: number
        deployments_active: number
        websocket_clients: number
        log_buffer_size: number
    }

    issues: HealthIssue[]
}

export interface HealthIssue {
    severity: 'warning' | 'critical'
    component: string
    message: string
    timestamp: string
}

export function createHealthRouter(): express.Router {
    const router = express.Router()

    // GET /api/v1/health - Overall health status
    router.get('/health', async (req, res) => {
        const health = await checkHealth()
        const statusCode = health.status === 'healthy' ? 200 :
                          health.status === 'degraded' ? 200 : 503
        res.status(statusCode).json(health)
    })

    // GET /api/v1/health/system - System metrics
    router.get('/health/system', async (req, res) => {
        res.json({
            cpu: getCPUUsage(),
            memory: getMemoryUsage(),
            disk: getDiskUsage(),
            network: getNetworkStats()
        })
    })

    // GET /api/v1/health/docker - Docker status
    router.get('/health/docker', async (req, res) => {
        res.json({
            swarm: getSwarmStatus(),
            services: getServicesStatus(),
            containers: getContainersStatus()
        })
    })

    // GET /api/v1/health/issues - Current issues
    router.get('/health/issues', async (req, res) => {
        const issues = await detectIssues()
        res.json({
            total: issues.length,
            critical: issues.filter(i => i.severity === 'critical').length,
            warnings: issues.filter(i => i.severity === 'warning').length,
            issues
        })
    })

    return router
}

async function checkHealth(): Promise<HealthStatus> {
    const uptime = process.uptime()
    const issues = await detectIssues()

    // Determine overall status
    const hasCritical = issues.some(i => i.severity === 'critical')
    const hasWarnings = issues.some(i => i.severity === 'warning')
    const status = hasCritical ? 'unhealthy' :
                  hasWarnings ? 'degraded' : 'healthy'

    return {
        status,
        uptime_seconds: uptime,
        timestamp: new Date().toISOString(),
        version: require('../../package.json').version,

        system: {
            cpu_usage_percent: getCPUUsage(),
            memory_used_percent: getMemoryUsage(),
            disk_used_percent: getDiskUsage(),
            load_average: os.loadavg()
        },

        docker: getDockerHealth(),
        flukedeploy: getFlukeDeployHealth(),
        issues
    }
}

async function detectIssues(): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = []

    // Check disk space
    const diskUsage = getDiskUsage()
    if (diskUsage > 90) {
        issues.push({
            severity: 'critical',
            component: 'disk',
            message: `Disk usage is ${diskUsage}% (critical threshold: 90%)`,
            timestamp: new Date().toISOString()
        })
    } else if (diskUsage > 80) {
        issues.push({
            severity: 'warning',
            component: 'disk',
            message: `Disk usage is ${diskUsage}% (warning threshold: 80%)`,
            timestamp: new Date().toISOString()
        })
    }

    // Check memory
    const memUsage = getMemoryUsage()
    if (memUsage > 95) {
        issues.push({
            severity: 'critical',
            component: 'memory',
            message: `Memory usage is ${memUsage}% (critical threshold: 95%)`,
            timestamp: new Date().toISOString()
        })
    } else if (memUsage > 85) {
        issues.push({
            severity: 'warning',
            component: 'memory',
            message: `Memory usage is ${memUsage}% (warning threshold: 85%)`,
            timestamp: new Date().toISOString()
        })
    }

    // Check Docker Swarm
    const swarmHealthy = checkSwarmHealth()
    if (!swarmHealthy) {
        issues.push({
            severity: 'critical',
            component: 'docker_swarm',
            message: 'Docker Swarm is not healthy or not initialized',
            timestamp: new Date().toISOString()
        })
    }

    // Check for unhealthy services
    const unhealthyServices = getUnhealthyServices()
    if (unhealthyServices.length > 0) {
        issues.push({
            severity: 'critical',
            component: 'services',
            message: `${unhealthyServices.length} service(s) are unhealthy: ${unhealthyServices.join(', ')}`,
            timestamp: new Date().toISOString()
        })
    }

    return issues
}

function getCPUUsage(): number {
    const cpus = os.cpus()
    let totalIdle = 0
    let totalTick = 0

    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type]
        }
        totalIdle += cpu.times.idle
    }

    return 100 - ~~(100 * totalIdle / totalTick)
}

function getMemoryUsage(): number {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return ((totalMem - freeMem) / totalMem) * 100
}

function getDiskUsage(): number {
    try {
        const output = execSync('df -h / | tail -1 | awk \'{print $5}\'').toString()
        return parseInt(output.replace('%', ''))
    } catch {
        return 0
    }
}
```

### 2.2 Diagnostics API

**File**: `src/api/DiagnosticsAPI.ts`

```typescript
/**
 * Self-diagnostics and problem detection
 */

export interface DiagnosticReport {
    timestamp: string
    overall_status: 'pass' | 'warning' | 'fail'
    checks: DiagnosticCheck[]
    recommendations: string[]
}

export interface DiagnosticCheck {
    name: string
    category: 'system' | 'docker' | 'network' | 'storage' | 'security'
    status: 'pass' | 'warning' | 'fail'
    message: string
    details?: any
}

export function createDiagnosticsRouter(): express.Router {
    const router = express.Router()

    // POST /api/v1/diagnose - Run full diagnostics
    router.post('/diagnose', async (req, res) => {
        const report = await runDiagnostics()
        res.json(report)
    })

    // GET /api/v1/diagnose/quick - Quick health check
    router.get('/diagnose/quick', async (req, res) => {
        const checks = await runQuickChecks()
        res.json(checks)
    })

    return router
}

async function runDiagnostics(): Promise<DiagnosticReport> {
    const checks: DiagnosticCheck[] = []

    // System checks
    checks.push(await checkDiskSpace())
    checks.push(await checkMemory())
    checks.push(await checkCPU())

    // Docker checks
    checks.push(await checkDockerRunning())
    checks.push(await checkSwarmInitialized())
    checks.push(await checkServicesHealthy())

    // Network checks
    checks.push(await checkPortsAvailable())
    checks.push(await checkDNSResolution())

    // Storage checks
    checks.push(await checkVolumesMounted())
    checks.push(await checkLogRotation())

    // Determine overall status
    const failed = checks.filter(c => c.status === 'fail').length
    const warnings = checks.filter(c => c.status === 'warning').length
    const overall = failed > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass'

    // Generate recommendations
    const recommendations = generateRecommendations(checks)

    return {
        timestamp: new Date().toISOString(),
        overall_status: overall,
        checks,
        recommendations
    }
}

function generateRecommendations(checks: DiagnosticCheck[]): string[] {
    const recommendations: string[] = []

    const diskCheck = checks.find(c => c.name === 'disk_space')
    if (diskCheck && diskCheck.status !== 'pass') {
        recommendations.push('Run log rotation: flukedeploy_repair("clean_logs")')
        recommendations.push('Remove unused Docker images: docker image prune -a')
    }

    const memCheck = checks.find(c => c.name === 'memory')
    if (memCheck && memCheck.status !== 'pass') {
        recommendations.push('Restart high-memory services')
        recommendations.push('Consider upgrading to higher-tier VPS')
    }

    return recommendations
}
```

### 2.3 Repair API (Self-Healing)

**File**: `src/api/RepairAPI.ts`

```typescript
/**
 * Self-healing and auto-repair functionality
 */

export interface RepairAction {
    action: string
    description: string
    automated: boolean  // Can be run without confirmation
    risk_level: 'low' | 'medium' | 'high'
}

export interface RepairResult {
    action: string
    status: 'success' | 'failed' | 'skipped'
    message: string
    logs: string[]
}

export function createRepairRouter(): express.Router {
    const router = express.Router()

    // GET /api/v1/repair/actions - List available repair actions
    router.get('/repair/actions', (req, res) => {
        res.json({
            actions: getAvailableRepairActions()
        })
    })

    // POST /api/v1/repair - Execute repair action
    router.post('/repair', async (req, res) => {
        const { action, confirm } = req.body

        const actionDef = getRepairAction(action)
        if (!actionDef) {
            return res.status(404).json({ error: 'Unknown repair action' })
        }

        // Check if confirmation required
        if (actionDef.risk_level === 'high' && !confirm) {
            return res.status(400).json({
                error: 'Confirmation required for high-risk action',
                action: actionDef
            })
        }

        const result = await executeRepairAction(action)
        res.json(result)
    })

    // POST /api/v1/repair/auto - Run automated repairs
    router.post('/repair/auto', async (req, res) => {
        const results = await runAutomatedRepairs()
        res.json({
            total: results.length,
            successful: results.filter(r => r.status === 'success').length,
            failed: results.filter(r => r.status === 'failed').length,
            results
        })
    })

    return router
}

function getAvailableRepairActions(): RepairAction[] {
    return [
        {
            action: 'clean_logs',
            description: 'Remove old log files to free disk space',
            automated: true,
            risk_level: 'low'
        },
        {
            action: 'prune_images',
            description: 'Remove unused Docker images',
            automated: true,
            risk_level: 'low'
        },
        {
            action: 'restart_unhealthy_services',
            description: 'Restart services that are unhealthy',
            automated: true,
            risk_level: 'medium'
        },
        {
            action: 'reset_network',
            description: 'Reset Docker network configuration',
            automated: false,
            risk_level: 'high'
        },
        {
            action: 'rebuild_nginx',
            description: 'Rebuild Nginx reverse proxy configuration',
            automated: false,
            risk_level: 'medium'
        }
    ]
}

async function executeRepairAction(action: string): Promise<RepairResult> {
    const logs: string[] = []

    try {
        switch (action) {
            case 'clean_logs':
                logs.push('Finding old log files...')
                execSync('find /flukedeploy/data/shared-logs -name "*.log" -mtime +30 -delete')
                logs.push('Deleted logs older than 30 days')
                return { action, status: 'success', message: 'Logs cleaned', logs }

            case 'prune_images':
                logs.push('Pruning unused Docker images...')
                const output = execSync('docker image prune -a -f').toString()
                logs.push(output)
                return { action, status: 'success', message: 'Images pruned', logs }

            case 'restart_unhealthy_services':
                logs.push('Finding unhealthy services...')
                const unhealthy = getUnhealthyServices()
                for (const service of unhealthy) {
                    logs.push(`Restarting ${service}...`)
                    execSync(`docker service update --force ${service}`)
                }
                return { action, status: 'success', message: `Restarted ${unhealthy.length} services`, logs }

            default:
                return { action, status: 'failed', message: 'Unknown action', logs }
        }
    } catch (error) {
        logs.push(`Error: ${error.message}`)
        return { action, status: 'failed', message: error.message, logs }
    }
}

async function runAutomatedRepairs(): Promise<RepairResult[]> {
    const results: RepairResult[] = []

    // Only run low-risk automated repairs
    const automatedActions = getAvailableRepairActions()
        .filter(a => a.automated && a.risk_level === 'low')

    for (const action of automatedActions) {
        const result = await executeRepairAction(action.action)
        results.push(result)
    }

    return results
}
```

---

## Phase 3: Enhanced MCP Tools

### 3.1 Complete Tool Suite

```python
# Installation
flukedeploy_install()  # Install on VPS
flukedeploy_configure()  # Update config
flukedeploy_upgrade()  # Upgrade version

# Health & Monitoring
flukedeploy_health()  # Overall health
flukedeploy_metrics()  # Performance metrics
flukedeploy_diagnose()  # Run diagnostics
flukedeploy_issues()  # List current issues

# Self-Healing
flukedeploy_repair(action)  # Execute repair
flukedeploy_auto_heal()  # Run automated repairs

# App Management (already have)
deploy_app()
deploy_status()
deploy_logs()
deploy_rollback()
deploy_validate()
deploy_history()

# Additional Management
flukedeploy_list_apps()  # All apps
flukedeploy_app_health(app_name)  # App health
flukedeploy_scale(app_name, replicas)  # Scale
flukedeploy_restart(app_name)  # Restart

# Backup & Recovery
flukedeploy_backup()  # Create backup
flukedeploy_restore(backup_id)  # Restore
flukedeploy_list_backups()  # List backups
```

---

## Implementation Phases

### Week 1: Installation Automation
- [ ] Create `install-flukedeploy.sh` script
- [ ] Build `flukedeploy_install` MCP tool
- [ ] Test on fresh VPS
- [ ] Document installation process

### Week 2: Management APIs
- [ ] Implement HealthAPI (`/api/v1/health`)
- [ ] Implement DiagnosticsAPI (`/api/v1/diagnose`)
- [ ] Implement RepairAPI (`/api/v1/repair`)
- [ ] Add API documentation

### Week 3: MCP Tools
- [ ] Add 10+ new MCP tools
- [ ] Test all tools end-to-end
- [ ] Update tool documentation

### Week 4: Self-Healing
- [ ] Implement automated issue detection
- [ ] Add repair actions (5-10 common fixes)
- [ ] Test auto-healing scenarios
- [ ] Monitor in production

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Installation time | < 5 min | Manual |
| Agent-initiated installs | 100% success | 0% |
| Health API response | < 100ms | N/A |
| Auto-heal success rate | > 80% | 0% |
| Issues detected | 10+ types | 0 |
| Issues auto-fixed | 5+ types | 0 |

---

**Status**: READY TO IMPLEMENT
**Next**: Start with Phase 1 (Installation Automation)
