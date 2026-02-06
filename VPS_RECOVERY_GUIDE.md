# VPS Recovery and Resource Management Guide

## Quick Status Check (Run First)

```bash
# Check if VPS is back online
ping -c 3 194.163.44.171

# Try SSH
ssh staging-vps "echo 'SSH OK'"

# Quick resource check
ssh staging-vps "free -h && df -h && docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

---

## Phase 1: Immediate Triage (Run as soon as SSH works)

### Step 1: Copy audit script to VPS

```bash
cd ~/Projects/flukedeploy
scp vps-resource-audit.sh staging-vps:/tmp/
ssh staging-vps "chmod +x /tmp/vps-resource-audit.sh"
```

### Step 2: Run audit and save report

```bash
ssh staging-vps "/tmp/vps-resource-audit.sh" > ~/Projects/flukedeploy/audit-$(date +%Y%m%d-%H%M).txt

# Review the report locally
cat ~/Projects/flukedeploy/audit-*.txt | less
```

### Step 3: Quick resource snapshot

```bash
# Get real-time resource usage
ssh staging-vps "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'"

# Check what's consuming most
ssh staging-vps "ps aux --sort=-%cpu | head -10"
ssh staging-vps "ps aux --sort=-%mem | head -10"
```

---

## Phase 2: Identify Problems

### Check for Resource Hogs

```bash
# Find containers using >50% CPU or >1GB RAM
ssh staging-vps "docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | awk '\$2 > 50 || \$3 ~ /[0-9]+GB/'"

# Check disk usage by container
ssh staging-vps "docker ps -q | xargs docker inspect --format='{{.Name}}\t{{.SizeRootFs}}' | sort -k2 -h"

# Large log files
ssh staging-vps "find /var/log -type f -size +100M -exec ls -lh {} \;"
```

### Check for Duplicate Services

Look for:
- Multiple databases (PostgreSQL, MySQL, Redis instances)
- Multiple monitoring tools (Prometheus, Grafana, NetData)
- Multiple proxy/load balancers
- Duplicate apps

```bash
# List all services
ssh staging-vps "docker service ls"

# List all containers
ssh staging-vps "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
```

---

## Phase 3: Cleanup (Run if resources >80%)

### Option A: Safe Cleanup

```bash
cd ~/Projects/flukedeploy
scp vps-cleanup-optimize.sh staging-vps:/tmp/
ssh staging-vps "chmod +x /tmp/vps-cleanup-optimize.sh"

# Run safe cleanup
ssh staging-vps "sudo /tmp/vps-cleanup-optimize.sh" | tee cleanup-report.txt
```

### Option B: Aggressive Cleanup (if critical)

```bash
# ⚠️  WARNING: Removes ALL unused Docker images
ssh staging-vps "sudo /tmp/vps-cleanup-optimize.sh --aggressive"
```

### Manual Cleanup Commands

```bash
# Stop and remove exited containers
ssh staging-vps "docker container prune -f"

# Remove dangling images
ssh staging-vps "docker image prune -f"

# Remove unused volumes
ssh staging-vps "docker volume prune -f"

# Clean logs older than 7 days
ssh staging-vps "journalctl --vacuum-time=7d"

# Truncate large Docker logs
ssh staging-vps "truncate -s 0 /var/lib/docker/containers/*/*-json.log"
```

---

## Phase 4: Set Resource Limits

### Configure Docker Daemon

```bash
# Create daemon.json with log rotation
ssh staging-vps 'cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF'

# Restart Docker
ssh staging-vps "systemctl restart docker"
```

### Set Limits on Existing Containers

```bash
# Example: Limit container to 512MB RAM and 0.5 CPU
ssh staging-vps "docker update --memory=512m --cpus=0.5 CONTAINER_NAME"

# For CapRover apps, update service
ssh staging-vps "docker service update --limit-memory=512m --limit-cpu=0.5 srv-captain--APP_NAME"
```

### Resource Allocation Strategy (16GB VPS)

| Component | Memory | CPU | Priority |
|-----------|--------|-----|----------|
| System + OS | 2GB | 0.5 | Critical |
| CapRover/FlukeDeploy | 2GB | 1.0 | Critical |
| PostgreSQL | 2GB | 1.0 | High |
| Redis (if any) | 512MB | 0.25 | Medium |
| App containers (each) | 512MB-1GB | 0.5 | Medium |
| Monitoring | 512MB | 0.25 | Low |
| **Reserve** | **2-3GB** | **1.0** | **Buffer** |

---

## Phase 5: Service Consolidation Strategy

### Step 1: Inventory Services

Create a spreadsheet with:
- Service name
- Purpose
- Memory usage
- CPU usage
- Can it be consolidated?
- Can it be removed?

### Step 2: Identify Consolidation Opportunities

**Common consolidations:**

1. **Databases**: Consolidate to single PostgreSQL instance with multiple databases
   ```bash
   # Instead of 3 PostgreSQL containers, use 1 with 3 databases
   CREATE DATABASE app1;
   CREATE DATABASE app2;
   CREATE DATABASE app3;
   ```

2. **Monitoring**: Choose ONE monitoring solution
   - Keep: NetData (lightweight) OR Prometheus+Grafana
   - Remove: Duplicate monitoring tools

3. **Caching**: Single Redis instance with multiple databases
   ```bash
   # Use Redis DB 0, 1, 2, etc. instead of multiple Redis containers
   SELECT 0;  # App 1
   SELECT 1;  # App 2
   ```

4. **Logs**: Centralized logging instead of per-app log storage

### Step 3: Migration Plan

For each service to consolidate:
1. Document current configuration
2. Test consolidated setup locally
3. Create migration script
4. Schedule downtime window
5. Migrate with rollback plan
6. Validate and monitor

---

## Phase 6: CapRover to FlukeDeploy Migration

### Pre-Migration Checklist

- [ ] VPS has <70% CPU usage
- [ ] VPS has >3GB free RAM
- [ ] VPS has >20GB free storage
- [ ] All services have resource limits
- [ ] Backup completed
- [ ] Migration tested locally

### Migration Strategy

**Option 1: Side-by-side (Safer)**
1. Deploy FlukeDeploy on alternate ports (3001, 81, 444)
2. Migrate apps one by one
3. Test each app in FlukeDeploy
4. Switch DNS/proxy once all validated
5. Remove CapRover

**Option 2: In-place (Faster)**
1. Stop CapRover
2. Export all app configs
3. Deploy FlukeDeploy on same ports
4. Import apps
5. Validate

### Migration Commands

```bash
# Check current CapRover apps
ssh staging-vps "docker service ls --filter 'name=srv-captain'"

# Export CapRover app config (manual from UI)
# Visit http://flukebase.me:3000/apps

# Deploy FlukeDeploy
cd ~/Projects/flukedeploy
./deploy-side-by-side.sh --vps staging-vps --ports 3001:81:444

# Migrate one app
ssh staging-vps "docker service create --name flukedeploy-app-test ..."

# Once validated, remove CapRover
ssh staging-vps "docker service rm captain-captain"
```

---

## Phase 7: Monitoring and Prevention

### Real-time Monitoring

```bash
# Terminal 1: Live resource monitoring
ssh staging-vps "htop"

# Terminal 2: Docker stats
ssh staging-vps "docker stats"

# Terminal 3: Disk usage watch
ssh staging-vps "watch -n 60 df -h"
```

### Set up Alerts

```bash
# Simple cron job to alert on high usage
ssh staging-vps 'cat > /usr/local/bin/resource-alert.sh <<EOF
#!/bin/bash
MEM_USED=\$(free | grep Mem | awk "{print \$3/\$2 * 100.0}")
if (( \$(echo "\$MEM_USED > 85" | bc -l) )); then
    echo "WARNING: Memory usage \${MEM_USED}%" | mail -s "VPS Memory Alert" your@email.com
fi
EOF'

ssh staging-vps "chmod +x /usr/local/bin/resource-alert.sh"
ssh staging-vps "crontab -l | { cat; echo '*/10 * * * * /usr/local/bin/resource-alert.sh'; } | crontab -"
```

### Prevention Checklist

- [ ] All containers have memory limits
- [ ] All containers have CPU limits
- [ ] Docker log rotation enabled
- [ ] System log rotation configured
- [ ] Monitoring/alerting active
- [ ] Monthly cleanup cron job
- [ ] Resource dashboard (Grafana/NetData)

---

## Emergency Procedures

### If VPS becomes unresponsive again

1. **Via Provider Console** (if SSH fails):
   ```bash
   # Login to provider dashboard
   # Access web console
   # Run: htop, docker ps, df -h
   # Stop heavy containers: docker stop CONTAINER_ID
   ```

2. **Quick Kill Heavy Services**:
   ```bash
   # Find and stop top consumer
   ssh staging-vps "docker stats --no-stream | sort -k3 -hr | head -5"
   ssh staging-vps "docker stop $(docker ps -q --filter name=HEAVY_SERVICE)"
   ```

3. **Emergency Reboot**:
   ```bash
   ssh staging-vps "sudo reboot"
   ```

---

## Resource Limit Templates

### Small App (Static site, API)
```bash
docker service update \
  --limit-memory=256m \
  --limit-cpu=0.25 \
  srv-captain--app-name
```

### Medium App (Web app with DB queries)
```bash
docker service update \
  --limit-memory=512m \
  --limit-cpu=0.5 \
  srv-captain--app-name
```

### Large App (Rails, Node with heavy processing)
```bash
docker service update \
  --limit-memory=1g \
  --limit-cpu=1.0 \
  srv-captain--app-name
```

### Database
```bash
docker service update \
  --limit-memory=2g \
  --limit-cpu=1.0 \
  srv-captain--postgres
```

---

## Useful Commands Reference

```bash
# Quick health check
ssh staging-vps "uptime && free -h && df -h"

# Top resource consumers
ssh staging-vps "docker stats --no-stream | sort -k3 -hr | head -10"

# Container logs (last 100 lines)
ssh staging-vps "docker logs --tail 100 CONTAINER_NAME"

# Restart a container
ssh staging-vps "docker restart CONTAINER_NAME"

# Check Swarm status
ssh staging-vps "docker node ls"

# List all CapRover apps
ssh staging-vps "docker service ls --filter 'name=srv-captain'"

# FlukeDeploy status
ssh staging-vps "docker service ps flukedeploy"

# System journal for errors
ssh staging-vps "journalctl -xe | tail -100"
```

---

## Next Steps After Recovery

1. ✅ Run audit script
2. ✅ Identify resource hogs
3. ✅ Apply cleanup if needed
4. ✅ Set resource limits
5. ✅ Create consolidation plan
6. ✅ Implement consolidation
7. ✅ Validate resources are stable (<70% usage)
8. ✅ Plan FlukeDeploy migration
9. ✅ Execute migration with monitoring
10. ✅ Set up ongoing monitoring/alerts

---

**Author**: OPERATOR Agent
**Date**: 2026-02-04
**VPS**: vps16gb (194.163.44.171)
**Goal**: Stable resource management for FlukeDeploy migration
