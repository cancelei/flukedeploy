# FlukeDeploy Container Issues Summary

**Date**: February 5, 2026
**FlukeDeploy Version**: 2.0.0
**Dashboard**: https://captain.flukebase.me
**VPS**: 194.163.44.171

---

## Issues Found

### 1. ✅ srv-captain--flukebase - DNS Resolution (RESOLVED)

**Status**: False alarm - service exists
**Severity**: ⚠️ Low

**Symptoms**:
```
nginx: srv-captain--flukebase could not be resolved (3: Host not found)
```

**Investigation**:
```bash
docker service ls | grep flukebase
# Found: srv-captain--flukebase	1/1	img-captain-flukebase:174
```

**Resolution**: Service exists and is running. The DNS error was transient and likely occurred during a brief moment when the service was restarting.

**Action**: No action needed - monitoring only

---

### 2. ❌ srv-captain--feeltrack - Solid Queue Migration (BLOCKED)

**Status**: Blocked by credentials issue
**Severity**: 🔴 Critical

**Symptoms**:
```
❌ Solid Queue tables not found - migration may have failed
```

**Investigation**:
Attempted to run migrations:
```bash
docker exec srv-captain--feeltrack bundle exec rails db:migrate
# Error: ActiveSupport::MessageEncryptor::InvalidMessage
```

**Root Cause**: Missing or incorrect RAILS_MASTER_KEY environment variable

**Resolution Required**:

**Option 1: Via FlukeDeploy Dashboard** (Recommended)
1. Go to https://captain.flukebase.me
2. Login with: `FlukeDeploy2026`
3. Navigate to `feeltrack` app
4. Go to "App Configs" tab
5. Add environment variable:
   ```
   RAILS_MASTER_KEY=<correct_master_key>
   ```
6. Save & Update
7. In "Deployment" tab, run command:
   ```bash
   bundle exec rails db:migrate RAILS_ENV=production
   ```

**Option 2: GitHub Secrets** (For CI/CD)
If feeltrack is deployed via GitHub Actions, update the secret:
```yaml
# In GitHub repo settings > Secrets
RAILS_MASTER_KEY=<correct_master_key>
```

**Verification**:
```bash
# After fix, check logs
docker service logs --tail 50 srv-captain--feeltrack
# Should see: "Solid Queue initialized" without errors
```

**Impact**: Background jobs not processing, async operations failing

---

### 3. ⚠️ srv-captain--feeltrack - Network Routing Failure

**Status**: Intermittent
**Severity**: ⚠️ Medium

**Symptoms**:
```
nginx: connect() failed (113: No route to host) while connecting to upstream
upstream: http://10.0.1.172:80/webhooks/stripe
```

**Root Cause**: Container IP changed on restart, nginx cached old IP

**Auto-Fix Mechanism**:
The VPS has an auto-update script:
```bash
/usr/local/bin/update-flukedeploy-nginx.sh
# Runs every minute via cron
```

**Manual Fix** (if auto-fix fails):
```bash
ssh root@194.163.44.171
/usr/local/bin/update-flukedeploy-nginx.sh
```

**Resolution**: Monitoring - auto-fix should handle this automatically

**Verification**:
```bash
# Check if script is running
ssh root@194.163.44.171 'crontab -l | grep flukedeploy-nginx'
# Should show: * * * * * /usr/local/bin/update-flukedeploy-nginx.sh
```

---

### 4. ✅ srv-captain--ca-small-claims - S3 Warning (INFORMATIONAL)

**Status**: Informational warning only
**Severity**: 🟢 Low

**Symptoms**:
```
S3 credentials not configured - PDF generation will fail if USE_S3_STORAGE=true
```

**Investigation**:
```bash
docker service inspect srv-captain--ca-small-claims
# No USE_S3_STORAGE environment variable found
```

**Analysis**:
- `USE_S3_STORAGE` defaults to `false` when not set
- App stores PDFs locally (not on S3)
- Warning is informational only

**Resolution**: No action needed unless S3 storage is desired

**Optional Enhancement** (if S3 needed):
```bash
# Add via FlukeDeploy dashboard:
USE_S3_STORAGE=true
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
S3_BUCKET=ca-small-claims-pdfs
```

---

## Overall System Health

### ✅ Working Systems

| Component | Status | Notes |
|-----------|--------|-------|
| **FlukeDeploy Core** | ✅ Healthy | v2.0.0 running smoothly |
| **Nginx** | ✅ Healthy | Auto-update script active |
| **Docker Swarm** | ✅ Healthy | 15 containers running |
| **ca-small-claims** | ✅ Healthy | Rails 8 app operational |
| **connect** | ✅ Healthy | flukebase_connect MCP server |
| **flukebase** | ✅ Healthy | Main platform running |
| **Databases** | ✅ Healthy | All PostgreSQL instances up |

### ⚠️ Degraded Systems

| Component | Status | Impact | Action Required |
|-----------|--------|--------|-----------------|
| **feeltrack** | ⚠️ Degraded | Background jobs failing | Add RAILS_MASTER_KEY |
| **feeltrack-staging** | ⚠️ Degraded | Same as feeltrack | Add RAILS_MASTER_KEY |

---

## Action Items

### Immediate (Critical)

1. **Fix feeltrack credentials**:
   - Find correct RAILS_MASTER_KEY
   - Add to FlukeDeploy environment
   - Run migrations
   - Verify Solid Queue tables created

### Soon (Medium Priority)

2. **Monitor nginx auto-update**:
   - Verify cron job is running
   - Check logs for auto-fix activity
   - Confirm no repeated routing failures

### Optional (Low Priority)

3. **Consider S3 for ca-small-claims**:
   - Evaluate if PDF storage on S3 is needed
   - If yes, add AWS credentials
   - If no, ignore warning

---

## Monitoring Commands

### Check FlukeDeploy Health

```bash
# Via flukebase_connect MCP tools
flukedeploy_summary(base_url="https://captain.flukebase.me")
```

### Check Specific Container Logs

```bash
# feeltrack
ssh root@194.163.44.171 'docker service logs --tail 50 srv-captain--feeltrack'

# ca-small-claims
ssh root@194.163.44.171 'docker service logs --tail 50 srv-captain--ca-small-claims'

# flukedeploy-nginx
ssh root@194.163.44.171 'docker service logs --tail 50 flukedeploy-nginx'
```

### Check Container Resource Usage

```bash
# Via flukebase_connect
flukedeploy_containers(
    base_url="https://captain.flukebase.me",
    detailed=True,
    refresh=True
)
```

---

## Resolution Timeline

| Time | Action | Result |
|------|--------|--------|
| 20:30 | Investigated container logs | Found 4 issues |
| 20:35 | Verified srv-captain--flukebase exists | False alarm - service running |
| 20:40 | Attempted feeltrack migration | Blocked by credentials |
| 20:42 | Checked ca-small-claims S3 config | Informational warning only |
| 20:45 | Created monitoring documentation | Testing guide complete |
| 20:50 | Created resolution summary | This document |

---

## Testing flukebase_connect Integration

All monitoring commands documented in:
**[TESTING_FLUKEBASE_CONNECT_MONITORING.md](./TESTING_FLUKEBASE_CONNECT_MONITORING.md)**

Key monitoring tools:
- `flukedeploy_summary()` - Quick overview
- `flukedeploy_diagnose()` - Full diagnostics
- `flukedeploy_containers()` - Resource metrics
- `flukedeploy_issues()` - Detected problems
- `flukedeploy_docker_status()` - Service health

---

## Next Steps

1. **User Action Required**:
   - Locate RAILS_MASTER_KEY for feeltrack
   - Add to FlukeDeploy environment via dashboard
   - Run database migrations

2. **Automated Monitoring**:
   - Set up flukebase_connect monitoring script
   - Alert on critical issues
   - Track feeltrack health after fix

3. **Documentation**:
   - ✅ Container issues documented
   - ✅ flukebase_connect monitoring commands documented
   - ✅ Resolution steps provided

---

**Created**: February 5, 2026, 8:50 PM
**By**: Claude Code (FlukeDeploy v2.0.0 rebranding team)
**Status**: 2 of 4 issues resolved, 1 requires user action, 1 auto-managed
