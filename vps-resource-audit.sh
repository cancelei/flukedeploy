#!/bin/bash
#
# VPS Resource Audit Script
# Diagnose resource exhaustion on vps16gb
#
# Usage: ./vps-resource-audit.sh > audit-report.txt
#

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 VPS Resource Audit Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Generated: $(date)"
echo "Host: $(hostname)"
echo ""

# ============================================================
# SECTION 1: System Overview
# ============================================================

echo "━━━ SECTION 1: System Overview ━━━"
echo ""

echo "=== OS Info ==="
uname -a
cat /etc/os-release | grep -E "^(NAME|VERSION)="
echo ""

echo "=== Uptime ==="
uptime
echo ""

echo "=== Load Average (last 1, 5, 15 min) ==="
cat /proc/loadavg
echo ""

# ============================================================
# SECTION 2: CPU Usage
# ============================================================

echo "━━━ SECTION 2: CPU Usage ━━━"
echo ""

echo "=== CPU Info ==="
lscpu | grep -E "^(Architecture|CPU\(s\)|Thread|Model name)"
echo ""

echo "=== Top 10 CPU Consuming Processes ==="
ps aux --sort=-%cpu | head -11
echo ""

echo "=== CPU Usage by Docker Containers ==="
if command -v docker &> /dev/null; then
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null || echo "Docker not running"
else
    echo "Docker not installed"
fi
echo ""

# ============================================================
# SECTION 3: Memory Usage
# ============================================================

echo "━━━ SECTION 3: Memory Usage ━━━"
echo ""

echo "=== Memory Overview ==="
free -h
echo ""

echo "=== Detailed Memory Info ==="
cat /proc/meminfo | grep -E "^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree)"
echo ""

echo "=== Top 10 Memory Consuming Processes ==="
ps aux --sort=-%mem | head -11
echo ""

echo "=== OOM Killer History (last 50 lines) ==="
if [ -f /var/log/syslog ]; then
    grep -i "out of memory\|killed process" /var/log/syslog 2>/dev/null | tail -50 || echo "No OOM events found"
elif [ -f /var/log/messages ]; then
    grep -i "out of memory\|killed process" /var/log/messages 2>/dev/null | tail -50 || echo "No OOM events found"
else
    echo "Log file not found"
fi
echo ""

# ============================================================
# SECTION 4: Disk Usage
# ============================================================

echo "━━━ SECTION 4: Disk Usage ━━━"
echo ""

echo "=== Filesystem Usage ==="
df -h
echo ""

echo "=== Inode Usage ==="
df -i
echo ""

echo "=== Top 10 Largest Directories in / ==="
du -h --max-depth=1 / 2>/dev/null | sort -rh | head -11
echo ""

echo "=== Docker Disk Usage ==="
if command -v docker &> /dev/null; then
    docker system df 2>/dev/null || echo "Docker not running"
else
    echo "Docker not installed"
fi
echo ""

echo "=== Large Log Files (>100MB) ==="
find /var/log -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}' || echo "No large log files"
echo ""

# ============================================================
# SECTION 5: Docker Services
# ============================================================

echo "━━━ SECTION 5: Docker Services ━━━"
echo ""

if command -v docker &> /dev/null; then
    echo "=== Docker Info ==="
    docker info 2>/dev/null | grep -E "(Server Version|Storage Driver|Containers|Images|Swarm)"
    echo ""

    echo "=== Docker Containers (Running) ==="
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
    echo ""

    echo "=== Docker Containers (All) ==="
    docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null
    echo ""

    echo "=== Docker Swarm Services ==="
    docker service ls 2>/dev/null || echo "Swarm not active"
    echo ""

    echo "=== Docker Images ==="
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null | head -20
    echo ""

    echo "=== Docker Volumes ==="
    docker volume ls 2>/dev/null
    echo ""

    echo "=== Docker Networks ==="
    docker network ls 2>/dev/null
    echo ""
else
    echo "Docker not installed"
fi

# ============================================================
# SECTION 6: CapRover/FlukeDeploy Services
# ============================================================

echo "━━━ SECTION 6: CapRover/FlukeDeploy Services ━━━"
echo ""

echo "=== CapRover Captain Service ==="
docker service ps captain-captain --format "table {{.Name}}\t{{.Image}}\t{{.CurrentState}}" 2>/dev/null || echo "CapRover not found"
echo ""

echo "=== All CapRover Apps (srv-captain-*) ==="
docker service ls --filter "name=srv-captain" 2>/dev/null || echo "No CapRover apps found"
echo ""

echo "=== FlukeDeploy Service ==="
docker service ps flukedeploy --format "table {{.Name}}\t{{.Image}}\t{{.CurrentState}}" 2>/dev/null || echo "FlukeDeploy not found"
echo ""

echo "=== CapRover Data Directory Size ==="
du -sh /captain 2>/dev/null || echo "/captain directory not found"
echo ""

echo "=== FlukeDeploy Data Directory Size ==="
du -sh /flukedeploy 2>/dev/null || echo "/flukedeploy directory not found"
echo ""

# ============================================================
# SECTION 7: System Services
# ============================================================

echo "━━━ SECTION 7: System Services ━━━"
echo ""

echo "=== Systemd Services (Failed) ==="
systemctl list-units --state=failed
echo ""

echo "=== Systemd Services (Running, top 10 by memory) ==="
systemctl status | grep "running" | head -10
echo ""

# ============================================================
# SECTION 8: Network Services
# ============================================================

echo "━━━ SECTION 8: Network Services ━━━"
echo ""

echo "=== Listening Ports ==="
netstat -tulpn 2>/dev/null | grep LISTEN || ss -tulpn | grep LISTEN
echo ""

echo "=== Active Connections Count ==="
netstat -an 2>/dev/null | grep ESTABLISHED | wc -l || ss -an | grep ESTABLISHED | wc -l
echo ""

# ============================================================
# SECTION 9: Recommendations
# ============================================================

echo "━━━ SECTION 9: Resource Analysis ━━━"
echo ""

# Calculate percentages
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
USED_MEM=$(free -m | awk 'NR==2{print $3}')
TOTAL_DISK=$(df -BG / | awk 'NR==2{print $2}' | sed 's/G//')
USED_DISK=$(df -BG / | awk 'NR==2{print $3}' | sed 's/G//')

MEM_PERCENT=$((USED_MEM * 100 / TOTAL_MEM))
DISK_PERCENT=$((USED_DISK * 100 / TOTAL_DISK))

echo "Memory Usage: ${MEM_PERCENT}% (${USED_MEM}MB / ${TOTAL_MEM}MB)"
echo "Disk Usage: ${DISK_PERCENT}% (${USED_DISK}GB / ${TOTAL_DISK}GB)"
echo ""

# Warnings
if [ $MEM_PERCENT -gt 80 ]; then
    echo "⚠️  WARNING: Memory usage >80% - Consider stopping non-critical services"
fi

if [ $DISK_PERCENT -gt 80 ]; then
    echo "⚠️  WARNING: Disk usage >80% - Clean up logs, images, or old containers"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Audit Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next Steps:"
echo "1. Review resource usage by container (Section 5)"
echo "2. Check for large log files (Section 4)"
echo "3. Identify services that can be consolidated"
echo "4. Set resource limits on Docker containers"
echo "5. Clean up unused images/volumes"
echo ""
