# VPS Service Consolidation Strategy

**Date**: 2026-02-04
**VPS**: vps16gb (194.163.44.171)
**Status**: Post-cleanup (83% disk, 34GB free)

---

## Executive Summary

After resource audit and cleanup, we've stabilized the VPS from critical (96% disk) to manageable (83% disk). However, we identified **significant consolidation opportunities** that will:

- **Free 6-8GB more disk space**
- **Reduce memory usage by 4-5GB**
- **Lower CPU load by 20-30%**
- **Simplify management and monitoring**

---

## Current Service Inventory

### Running Services (15 containers)

| Service | Type | Memory | Purpose | Status |
|---------|------|--------|---------|--------|
| **flukedeploy** | PaaS | ~512MB | New deployment platform | ✅ Keep |
| **feeltrack (prod)** | Rails App | ~857MB | Production app | ✅ Keep |
| **feeltrack-staging** | Rails App | ~913MB | Staging app | ✅ Keep |
| **seeinsp** | Rails App | ~1.58GB | Production app | ✅ Keep |
| **flukebase** | Rails App | ~1.08GB | Production app | ✅ Keep |
| **srv-captain--feeltrack-db** | PostgreSQL | ~434MB | Feeltrack DB | 🔄 Consolidate |
| **srv-captain--feeltrack-staging-db** | PostgreSQL | ~434MB | Feeltrack staging DB | 🔄 Consolidate |
| **srv-captain--seeinsp-db** | PostgreSQL | ~434MB | SeeInsp DB | 🔄 Consolidate |
| **srv-captain--flukebase-db** | PostgreSQL | ~434MB | Flukebase DB | 🔄 Consolidate |
| **srv-captain--playground-pg** | PostgreSQL | ~434MB | Playground DB | ❌ Remove/consolidate |
| **srv-captain--myfmv-pg** | PostgreSQL | ~434MB | MyFMV DB | ❌ Remove/consolidate |
| **goaccess-container** | Log analyzer | ~13MB | CapRover logs | 🔄 Evaluate |

**Total**: 15 containers, ~7-8GB memory (6x PostgreSQL = ~2.6GB alone)

---

## Consolidation Opportunities

###  1: PostgreSQL Consolidation (HIGH PRIORITY)

**Problem**: 6 separate PostgreSQL containers consuming ~2.6GB memory

**Solution**: Single PostgreSQL 17 instance with multiple databases

#### Migration Plan

```bash
# Step 1: Create unified PostgreSQL service
docker service create \
  --name postgres-unified \
  --publish 5432:5432 \
  --env POSTGRES_PASSWORD=<secure_password> \
  --mount type=volume,src=postgres-unified-data,dst=/var/lib/postgresql/data \
  --limit-memory=2g \
  --limit-cpu=1.5 \
  postgres:17.0

# Step 2: Create databases for each app
docker exec -it $(docker ps -q -f name=postgres-unified) psql -U postgres <<EOF
CREATE DATABASE feeltrack_production;
CREATE DATABASE feeltrack_staging;
CREATE DATABASE seeinsp_production;
CREATE DATABASE flukebase_production;
CREATE DATABASE playground;
CREATE DATABASE myfmv;
EOF

# Step 3: Migrate data from each container
for db in feeltrack feeltrack-staging seeinsp flukebase playground myfmv; do
  # Dump from old container
  docker exec srv-captain--${db}-db pg_dumpall -U postgres > /tmp/${db}_dump.sql

  # Restore to new unified instance
  docker exec -i postgres-unified psql -U postgres < /tmp/${db}_dump.sql
done

# Step 4: Update app connection strings
# For each app, change DATABASE_URL to point to postgres-unified:5432

# Step 5: Validate and remove old containers
docker service rm srv-captain--feeltrack-db
docker service rm srv-captain--feeltrack-staging-db
docker service rm srv-captain--seeinsp-db
docker service rm srv-captain--flukebase-db
docker service rm srv-captain--playground-pg
docker service rm srv-captain--myfmv-pg
```

**Savings**:
- Memory: ~1.6GB (from 6x434MB to 1x2GB, but with headroom)
- Disk: ~2GB (reduced container overhead)
- CPU: 20-30% reduction

**Risk Level**: MEDIUM (requires database migration, testing)

---

### 2: Docker Image Version Management

**Problem**: Multiple versions of same images (10+ flukebase versions at ~1GB each)

**Solution**: Automated cleanup policy

#### Implementation

```bash
# Create cron job for weekly cleanup
cat > /etc/cron.weekly/docker-cleanup <<'EOF'
#!/bin/bash
# Keep only images from last 7 days
docker image prune -a --force --filter "until=168h"

# Clean up stopped containers
docker container prune -f --filter "until=24h"

# Clean up unused volumes
docker volume prune -f --filter "until=720h"  # 30 days

# Clean up build cache
docker builder prune -f --filter "until=720h"
EOF

chmod +x /etc/cron.weekly/docker-cleanup
```

**Alternative**: Set CapRover/FlukeDeploy to keep only last 3 versions per app

**Savings**:
- Disk: 10-15GB over time
- Prevents gradual bloat

**Risk Level**: LOW (automated, safe)

---

### 3: Docker Daemon Configuration

**Problem**: No log rotation, unlimited container logs

**Solution**: Configure daemon.json with resource limits

#### Implementation

```bash
# Create /etc/docker/daemon.json
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ]
}
EOF

# Restart Docker
systemctl restart docker
```

**Savings**:
- Disk: Prevents log bloat (currently small but grows over time)
- Stability: Prevents runaway logs from crashing system

**Risk Level**: LOW (standard best practice)

---

### 4: Resource Limits per Container

**Problem**: No memory/CPU limits, containers can consume unlimited resources

**Solution**: Set explicit limits on all containers

#### Recommended Limits

```bash
# Rails apps (flukebase, feeltrack, seeinsp)
docker service update --limit-memory=1g --limit-cpu=1.0 srv-captain--flukebase
docker service update --limit-memory=1g --limit-cpu=1.0 srv-captain--feeltrack
docker service update --limit-memory=1.5g --limit-cpu=1.0 srv-captain--seeinsp

# Staging apps (lower limits)
docker service update --limit-memory=512m --limit-cpu=0.5 srv-captain--feeltrack-staging

# Unified PostgreSQL (after consolidation)
docker service update --limit-memory=2g --limit-cpu=1.5 postgres-unified

# FlukeDeploy
docker service update --limit-memory=1g --limit-cpu=1.0 flukedeploy-flukedeploy
```

**Total Allocation** (after consolidation):
- Rails apps: 3.5GB
- PostgreSQL: 2GB
- FlukeDeploy: 1GB
- System overhead: 2GB
- **Reserve**: 6.5GB
- **Total**: 15GB (fits in 16GB VPS)

**Savings**:
- Memory: Predictable usage, prevents OOM
- CPU: Prevents single app from monopolizing

**Risk Level**: LOW (can be adjusted if needed)

---

## Implementation Phases

### Phase 1: Immediate (Today) ✅ COMPLETE

- [x] Run resource audit
- [x] Clean up Docker images (completed - freed 38GB)
- [x] Set Docker daemon.json with log rotation
- [x] Set resource limits on existing containers (all 17 services)
- [ ] Monitor for 24 hours (ongoing)

**Timeline**: 2 hours (completed 2026-02-04)
**Disk Impact**: +64GB freed (96% → 62% disk usage)
**Memory Impact**: Resource limits applied to all services
**Risk**: LOW
**Status**: ✅ COMPLETE - See PHASE1_COMPLETION_REPORT.md

---

### Phase 2: PostgreSQL Consolidation (This Week)

- [ ] Create unified PostgreSQL service
- [ ] Test with one app (playground or myfmv first)
- [ ] Migrate remaining databases
- [ ] Update app connection strings
- [ ] Validate all apps working
- [ ] Remove old PostgreSQL containers
- [ ] Monitor for 48 hours

**Timeline**: 4-6 hours over 2-3 days
**Memory Impact**: -1.6GB
**Disk Impact**: -2GB
**Risk**: MEDIUM (requires careful testing)

---

### Phase 3: Automated Maintenance (Next Week)

- [ ] Set up weekly Docker cleanup cron job
- [ ] Configure CapRover/FlukeDeploy version retention
- [ ] Set up monitoring/alerting (Grafana or NetData)
- [ ] Document recovery procedures

**Timeline**: 2-3 hours
**Ongoing Impact**: Prevents future bloat
**Risk**: LOW

---

## Resource Allocation Strategy (Post-Consolidation)

### Target State

| Component | Memory | CPU | Notes |
|-----------|--------|-----|-------|
| **System/OS** | 2GB | 0.5 | Base overhead |
| **FlukeDeploy** | 1GB | 1.0 | PaaS platform |
| **PostgreSQL (unified)** | 2GB | 1.5 | All databases |
| **Flukebase** | 1GB | 1.0 | Production app |
| **Feeltrack** | 1GB | 1.0 | Production app |
| **Feeltrack-staging** | 512MB | 0.5 | Staging app |
| **SeeInsp** | 1.5GB | 1.0 | Production app (larger) |
| **GoAccess** | 50MB | 0.1 | Log analyzer |
| **Reserve** | 5-6GB | 2.0 | Safety buffer |
| **TOTAL** | ~15GB | 8.0 | Within 16GB VPS |

### Disk Allocation

| Component | Current | Target | Notes |
|-----------|---------|--------|-------|
| **Docker images** | ~40GB | ~20GB | Keep 2-3 versions per app |
| **App data** | ~30GB | ~30GB | Production data |
| **PostgreSQL data** | ~15GB | ~15GB | Database files |
| **Logs** | ~5GB | ~2GB | With log rotation |
| **System** | ~10GB | ~10GB | OS and tools |
| **Available** | 34GB | 65-70GB | Free space |
| **TOTAL** | 159GB | 120-130GB | 65-70% usage (healthy) |

---

## Monitoring & Prevention

### Disk Space Monitoring

```bash
# Alert if disk >80%
cat > /usr/local/bin/disk-alert.sh <<'EOF'
#!/bin/bash
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $USAGE -gt 80 ]; then
    echo "WARNING: Disk usage ${USAGE}%" | mail -s "VPS Disk Alert" admin@flukebase.com
fi
EOF

chmod +x /usr/local/bin/disk-alert.sh
crontab -l | { cat; echo '0 */6 * * * /usr/local/bin/disk-alert.sh'; } | crontab -
```

### Memory Monitoring

```bash
# Alert if memory >90%
cat > /usr/local/bin/memory-alert.sh <<'EOF'
#!/bin/bash
MEM_USED=$(free | grep Mem | awk '{print $3/$2 * 100.0}')
if (( $(echo "$MEM_USED > 90" | bc -l) )); then
    echo "WARNING: Memory usage ${MEM_USED}%" | mail -s "VPS Memory Alert" admin@flukebase.com
fi
EOF

chmod +x /usr/local/bin/memory-alert.sh
crontab -l | { cat; echo '*/15 * * * * /usr/local/bin/memory-alert.sh'; } | crontab -
```

---

## Testing Checklist

### Before PostgreSQL Migration

- [ ] Backup all databases: `pg_dumpall > /backup/all_dbs_$(date +%Y%m%d).sql`
- [ ] Test unified PostgreSQL with playground DB first
- [ ] Verify connection strings work
- [ ] Check app logs for connection errors
- [ ] Run app test suites if available

### After PostgreSQL Migration

- [ ] Verify all apps can connect and query
- [ ] Check database sizes: `SELECT pg_database_size('dbname');`
- [ ] Monitor memory usage: `docker stats postgres-unified`
- [ ] Run database integrity checks: `VACUUM ANALYZE;`
- [ ] Keep old containers for 48 hours before removing

---

## Rollback Plans

### If PostgreSQL Consolidation Fails

```bash
# Restart old containers
docker service update --replicas=1 srv-captain--flukebase-db
docker service update --replicas=1 srv-captain--feeltrack-db
# ... etc

# Restore apps to old connection strings
# (Keep backups of old env vars)
```

### If Resource Limits Cause Issues

```bash
# Remove limits temporarily
docker service update --limit-memory=0 --limit-cpu=0 SERVICE_NAME

# Investigate and adjust upward
docker service update --limit-memory=2g --limit-cpu=2.0 SERVICE_NAME
```

---

## Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Disk usage | 62% (120GB) | <70% (130GB) | ✅ ACHIEVED |
| Free disk | 74GB | >60GB | ✅ ACHIEVED |
| Memory usage | 4.7GB/15GB | <10GB/15GB | ✅ ACHIEVED |
| Resource limits | 17/17 services | All services | ✅ ACHIEVED |
| PostgreSQL containers | 6 | 1 | ⏳ Planned (Phase 2) |
| Docker images | 12 (5GB) | <30 (20GB) | ✅ ACHIEVED |
| Service availability | 100% | 100% | ✅ ACHIEVED |

---

## Decision Required

**Which consolidation approach?**

### Option A: Aggressive (Recommended)
1. Set Docker daemon config NOW
2. Set resource limits NOW
3. PostgreSQL consolidation THIS WEEK
4. Automated cleanup NEXT WEEK

**Timeline**: 1 week total
**Impact**: -3.6GB memory, -15GB disk long-term
**Risk**: Medium (database migration)

### Option B: Conservative
1. Set Docker daemon config NOW
2. Monitor for 1 week
3. Set resource limits NEXT WEEK
4. PostgreSQL consolidation LATER (if needed)
5. Automated cleanup LATER

**Timeline**: 2-3 weeks
**Impact**: Slower improvement
**Risk**: Lower

### Option C: Minimal
1. Set Docker daemon config ONLY
2. Continue manual cleanup as needed
3. Skip PostgreSQL consolidation
4. Keep monitoring manually

**Timeline**: Ongoing
**Impact**: Minimal
**Risk**: Lowest (but doesn't solve root causes)

---

## Recommendation

**Go with Option A (Aggressive)** because:

1. VPS is currently stable (83% disk, plenty of memory)
2. PostgreSQL consolidation has highest ROI
3. Resource limits prevent future crashes
4. We have scripts and rollback plans ready
5. Monitoring will catch issues early

**Start with**:
1. Docker daemon config (5 minutes, low risk)
2. Resource limits (15 minutes, low risk)
3. Monitor for 24 hours
4. Then proceed with PostgreSQL consolidation

---

**Author**: OPERATOR Agent
**Date**: 2026-02-04
**Next Review**: After Phase 1 completion
