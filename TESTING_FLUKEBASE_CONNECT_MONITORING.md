# Testing flukebase_connect FlukeDeploy Monitoring Commands

**Date**: February 5, 2026
**FlukeDeploy Version**: 2.0.0
**Dashboard**: https://captain.flukebase.me

## Overview

This document demonstrates how to use flukebase_connect MCP tools to monitor FlukeDeploy applications and diagnose issues found on February 5, 2026.

---

## Available Monitoring Tools

| Tool | Purpose | Use Case |
|------|---------|----------|
| `flukedeploy_summary` | Human-readable overview | Quick health check |
| `flukedeploy_health` | Detailed health metrics | System resource monitoring |
| `flukedeploy_diagnose` | Run diagnostics | Find configuration issues |
| `flukedeploy_issues` | List detected issues | See known problems |
| `flukedeploy_docker_status` | Docker Swarm status | Service health checks |
| `flukedeploy_containers` | Per-container metrics | Resource usage by container |
| `flukedeploy_metrics` | System metrics | CPU, memory, disk usage |

---

## Quick Health Check

```python
# Get human-readable summary
flukedeploy_summary(base_url="https://captain.flukebase.me")
```

**Expected Output**:
```
✅ FlukeDeploy Status: HEALTHY

System Resources:
- CPU: 15%
- Memory: 4256MB / 16384MB (26%)
- Disk: 42GB / 158GB (27%)

Docker:
- 14 services
- 15 containers running
- Swarm: ✅ healthy

Apps Deployed: 10

Issues: 3
🔴 [feeltrack] Solid Queue tables not found
⚠️ [nginx] DNS resolution failure for srv-captain--flukebase
⚠️ [ca-small-claims] S3 credentials not configured
```

---

## Comprehensive Diagnostics

```python
# Run full diagnostic suite
flukedeploy_diagnose(
    base_url="https://captain.flukebase.me",
    quick=False
)
```

**What it checks**:
- Docker Swarm health
- Service statuses
- Network connectivity
- SSL certificate validity
- Disk space
- Memory pressure
- Load average
- FlukeDeploy configuration

---

## Issues Found on February 5, 2026

### Issue 1: Feeltrack - Solid Queue Migration Failed

**Severity**: 🔴 Critical
**Container**: `srv-captain--feeltrack`

**Symptoms**:
```
❌ Solid Queue tables not found - migration may have failed
```

**Root Cause**: Rails 8 migrations not executed after deployment

**Fix**:
```bash
# Option 1: Via FlukeDeploy dashboard
# 1. Go to https://captain.flukebase.me
# 2. Open feeltrack app
# 3. Run: rails db:migrate

# Option 2: Via SSH
ssh root@194.163.44.171
docker exec -it $(docker ps -qf name=srv-captain--feeltrack) \
  bundle exec rails db:migrate RAILS_ENV=production
```

**Verification**:
```python
flukedeploy_containers(
    base_url="https://captain.flukebase.me",
    refresh=True
)
# Check feeltrack container logs for successful migration
```

---

### Issue 2: Flukebase - DNS Resolution Failure

**Severity**: ⚠️ Warning
**Component**: `flukedeploy-nginx`

**Symptoms**:
```
srv-captain--flukebase could not be resolved (3: Host not found)
```

**Root Cause**: Either:
1. Service `srv-captain--flukebase` doesn't exist
2. DNS resolver issue in nginx
3. Service name mismatch

**Investigation**:
```python
# Check Docker services
flukedeploy_docker_status(base_url="https://captain.flukebase.me")

# Look for services matching 'flukebase'
```

**Expected Fix**:
```bash
# Check if service exists
ssh root@194.163.44.171
docker service ls | grep flukebase

# If service doesn't exist, create it via FlukeDeploy dashboard
# If service exists but has different name, update nginx config
```

---

### Issue 3: Feeltrack - Network Routing Failure

**Severity**: ⚠️ Warning
**Component**: `flukedeploy-nginx` → `srv-captain--feeltrack`

**Symptoms**:
```
connect() failed (113: No route to host) while connecting to upstream
upstream: http://10.0.1.172:80/webhooks/stripe
```

**Root Cause**: Container IP changed but nginx cached old IP

**Fix**:
```bash
# Auto-update script should handle this
# Check if it's running:
ssh root@194.163.44.171
cat /etc/cron.d/flukedeploy-nginx-monitor

# Manual fix if needed:
/usr/local/bin/update-flukedeploy-nginx.sh
```

---

### Issue 4: CA Small Claims - S3 Configuration

**Severity**: ⚠️ Warning
**Container**: `srv-captain--ca-small-claims`

**Symptoms**:
```
S3 credentials not configured - PDF generation will fail if USE_S3_STORAGE=true
```

**Root Cause**: Missing AWS credentials in environment

**Fix**:
```bash
# Option 1: Add S3 credentials
# Via FlukeDeploy dashboard > ca-small-claims > Environment Variables:
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
S3_BUCKET=ca-small-claims-pdfs

# Option 2: Disable S3 storage
USE_S3_STORAGE=false
```

---

## Per-Container Resource Monitoring

```python
# Get detailed container metrics
flukedeploy_containers(
    base_url="https://captain.flukebase.me",
    detailed=True,  # Include network/block I/O
    refresh=False   # Use 30s cache
)
```

**Example Output**:
```json
{
  "containers": [
    {
      "name": "srv-captain--feeltrack",
      "cpu_percent": 2.5,
      "memory_used_mb": 512,
      "memory_limit_mb": 1024,
      "memory_percent": 50.0,
      "network_rx_mb": 145.2,
      "network_tx_mb": 89.3,
      "block_read_mb": 512.4,
      "block_write_mb": 128.7,
      "health": "unhealthy",
      "uptime_seconds": 3600,
      "status": "running"
    }
  ],
  "summary": {
    "total_containers": 15,
    "running": 15,
    "unhealthy": 1,
    "total_cpu_percent": 15.2,
    "total_memory_mb": 4256
  }
}
```

---

## Monitoring Workflow

### Daily Health Check

```python
# 1. Quick summary
flukedeploy_summary()

# 2. If issues found, get details
flukedeploy_issues()

# 3. Check specific container
flukedeploy_containers(refresh=True)
```

### Performance Investigation

```python
# 1. Get system metrics
flukedeploy_metrics()

# 2. Get container breakdown
flukedeploy_containers(detailed=True, refresh=True)

# 3. Check Docker services
flukedeploy_docker_status()
```

### Deployment Verification

```python
# 1. Run diagnostics before deploy
flukedeploy_diagnose(quick=True)

# 2. Deploy app
# ... deployment ...

# 3. Verify after deploy
flukedeploy_summary()
flukedeploy_containers(refresh=True)
```

---

## Automation Examples

### Proactive Monitoring

```python
import asyncio
from flukebase_connect import flukedeploy_summary

async def monitor_flukedeploy():
    """Monitor FlukeDeploy every 5 minutes."""
    while True:
        result = await flukedeploy_summary()

        if "unhealthy" in result.lower() or "critical" in result.lower():
            # Alert team
            print(f"⚠️ ALERT: {result}")

        await asyncio.sleep(300)  # 5 minutes
```

### Pre-Deployment Check

```python
async def pre_deploy_check():
    """Verify system health before deployment."""
    health = await flukedeploy_health()

    if health["status"] != "healthy":
        raise Exception(f"System unhealthy: {health['issues']}")

    if health["system"]["memory_used_percent"] > 80:
        raise Exception("Memory usage too high for safe deployment")

    if health["system"]["disk_used_percent"] > 90:
        raise Exception("Disk space critical")

    print("✅ Pre-deployment checks passed")
```

---

## Testing These Commands

### From Claude Code (with flukebase_connect MCP)

```python
# Test each monitoring command
wedo_continue()  # Start session

# Quick health check
flukedeploy_summary(base_url="https://captain.flukebase.me")

# Detailed diagnostics
flukedeploy_diagnose(
    base_url="https://captain.flukebase.me",
    quick=False
)

# Container metrics
flukedeploy_containers(
    base_url="https://captain.flukebase.me",
    detailed=True,
    refresh=True
)

# Docker status
flukedeploy_docker_status(base_url="https://captain.flukebase.me")

# List issues
flukedeploy_issues(base_url="https://captain.flukebase.me")
```

### From Python Script

```python
from flukebase_connect_client import FlukeBaseClient

client = FlukeBaseClient(api_token="fbk_xxx")

# Use monitoring tools
result = client.flukedeploy_summary(
    base_url="https://captain.flukebase.me"
)

print(result)
```

---

## Expected Fixes Summary

| Issue | Priority | Action Required |
|-------|----------|-----------------|
| feeltrack Solid Queue | 🔴 High | Run `rails db:migrate` |
| flukebase DNS | 🟡 Medium | Investigate service existence |
| feeltrack network | 🟡 Medium | Auto-update script running |
| ca-small-claims S3 | 🟢 Low | Add credentials or disable S3 |

---

## Next Steps

1. **Fix Critical Issues**:
   - Run feeltrack migrations immediately

2. **Investigate Warnings**:
   - Check if srv-captain--flukebase service should exist
   - Verify nginx auto-update script is functioning

3. **Configure Applications**:
   - Add S3 credentials to ca-small-claims
   - Or disable S3 storage if not needed

4. **Automate Monitoring**:
   - Set up flukebase_connect monitoring script
   - Create alerts for critical issues

---

## API Endpoints Reference

FlukeDeploy v2.0.0 exposes these monitoring endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/health` | GET | Overall health status |
| `/api/v2/health/system` | GET | System metrics |
| `/api/v2/health/docker` | GET | Docker Swarm status |
| `/api/v2/health/issues` | GET | Detected issues |
| `/api/v2/health/containers` | GET | Container metrics |
| `/api/v2/diagnose` | POST | Run full diagnostics |
| `/api/v2/diagnose/quick` | GET | Quick health checks |

**Note**: These endpoints are accessed via flukebase_connect MCP tools. Direct API access requires authentication with `x-flukedeploy-auth` header.

---

**Status**: Document created February 5, 2026
**FlukeDeploy Version**: 2.0.0 (Post-Rebranding)
**Dashboard**: https://captain.flukebase.me
