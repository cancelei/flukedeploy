#!/bin/bash
#
# VPS Cleanup and Optimization Script
# Free up resources on vps16gb
#
# Usage: ./vps-cleanup-optimize.sh [--aggressive]
#

set -e

AGGRESSIVE=false

if [[ "$1" == "--aggressive" ]]; then
    AGGRESSIVE=true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 VPS Cleanup and Optimization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$AGGRESSIVE" = true ]; then
    echo "⚠️  AGGRESSIVE MODE ENABLED"
    echo ""
fi

# ============================================================
# SECTION 1: Docker Cleanup
# ============================================================

echo "━━━ SECTION 1: Docker Cleanup ━━━"
echo ""

echo "=== Before Cleanup ==="
docker system df
echo ""

echo "[1/7] Removing stopped containers..."
docker container prune -f
echo ""

echo "[2/7] Removing dangling images..."
docker image prune -f
echo ""

if [ "$AGGRESSIVE" = true ]; then
    echo "[3/7] AGGRESSIVE: Removing all unused images..."
    docker image prune -a -f
else
    echo "[3/7] Skipping unused images cleanup (use --aggressive to enable)"
fi
echo ""

echo "[4/7] Removing unused volumes..."
docker volume prune -f
echo ""

echo "[5/7] Removing unused networks..."
docker network prune -f
echo ""

echo "[6/7] Removing build cache..."
docker builder prune -f
echo ""

echo "[7/7] Full system cleanup..."
docker system prune -f
echo ""

echo "=== After Cleanup ==="
docker system df
echo ""

# ============================================================
# SECTION 2: Log Rotation and Cleanup
# ============================================================

echo "━━━ SECTION 2: Log Cleanup ━━━"
echo ""

echo "[1/4] Cleaning systemd journal (keep last 7 days)..."
journalctl --vacuum-time=7d
echo ""

echo "[2/4] Cleaning old log files..."
find /var/log -type f -name "*.log.*" -mtime +30 -delete 2>/dev/null || true
find /var/log -type f -name "*.gz" -mtime +30 -delete 2>/dev/null || true
echo "Old logs cleaned"
echo ""

echo "[3/4] Truncating large log files (>500MB)..."
find /var/log -type f -size +500M -exec sh -c 'echo "Truncating: $1"; > "$1"' _ {} \; 2>/dev/null || true
echo ""

echo "[4/4] Docker container log sizes..."
if [ "$AGGRESSIVE" = true ]; then
    echo "AGGRESSIVE: Truncating all Docker container logs..."
    truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true
    echo "Docker logs truncated"
else
    echo "Current Docker log sizes:"
    du -sh /var/lib/docker/containers 2>/dev/null || echo "Cannot access Docker logs"
    echo "(use --aggressive to truncate)"
fi
echo ""

# ============================================================
# SECTION 3: Package Manager Cleanup
# ============================================================

echo "━━━ SECTION 3: Package Manager Cleanup ━━━"
echo ""

if command -v apt-get &> /dev/null; then
    echo "[1/3] Cleaning apt cache..."
    apt-get clean
    apt-get autoclean
    echo ""

    echo "[2/3] Removing unused packages..."
    apt-get autoremove -y
    echo ""

    echo "[3/3] Cleaning old kernels..."
    # Keep current and one previous kernel
    if [ "$AGGRESSIVE" = true ]; then
        apt-get autoremove --purge -y
    fi
    echo ""
fi

# ============================================================
# SECTION 4: Set Docker Resource Limits
# ============================================================

echo "━━━ SECTION 4: Docker Resource Limits ━━━"
echo ""

echo "Checking Docker daemon configuration..."
if [ -f /etc/docker/daemon.json ]; then
    echo "Current daemon.json:"
    cat /etc/docker/daemon.json
else
    echo "Creating /etc/docker/daemon.json with resource limits..."
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
  }
}
EOF
    echo "✓ Created daemon.json with log rotation"
    echo "⚠️  Restart Docker for changes to take effect: systemctl restart docker"
fi
echo ""

# ============================================================
# SECTION 5: CapRover Specific Cleanup
# ============================================================

echo "━━━ SECTION 5: CapRover Cleanup ━━━"
echo ""

echo "Checking CapRover data directories..."
if [ -d /captain ]; then
    echo "CapRover data size:"
    du -sh /captain/*
    echo ""

    echo "Cleaning CapRover logs..."
    find /captain -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    echo "Old CapRover logs cleaned"
else
    echo "No CapRover data directory found"
fi
echo ""

# ============================================================
# SECTION 6: System Optimization
# ============================================================

echo "━━━ SECTION 6: System Optimization ━━━"
echo ""

echo "[1/3] Dropping caches..."
sync
echo 3 > /proc/sys/vm/drop_caches
echo "✓ Caches dropped"
echo ""

echo "[2/3] Checking swap usage..."
free -h | grep -i swap
echo ""

echo "[3/3] Checking for zombie processes..."
ps aux | awk '$8 ~ /Z/ { print }'
echo ""

# ============================================================
# SECTION 7: Summary
# ============================================================

echo "━━━ SECTION 7: Summary ━━━"
echo ""

echo "=== Disk Space Freed ==="
df -h /
echo ""

echo "=== Memory Status ==="
free -h
echo ""

echo "=== Docker Status ==="
docker system df
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cleanup Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Recommended Next Steps:"
echo ""
echo "1. Review Docker container resource usage:"
echo "   docker stats"
echo ""
echo "2. Set resource limits on heavy containers:"
echo "   docker update --memory=512m --cpus=0.5 <container>"
echo ""
echo "3. Monitor system for 15-30 minutes:"
echo "   htop  # or top"
echo ""
echo "4. If Docker daemon.json was created, restart Docker:"
echo "   systemctl restart docker"
echo ""
echo "5. Consider stopping non-essential services during deployment"
echo ""
