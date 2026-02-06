#!/bin/bash
#
# Wait for VPS to come back online and run initial diagnostics
#
# Usage: ./wait-for-vps.sh
#

VPS_IP="194.163.44.171"
VPS_HOST="staging-vps"
CHECK_INTERVAL=30  # seconds

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏳ Waiting for VPS to come online..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "VPS IP:   $VPS_IP"
echo "VPS Host: $VPS_HOST"
echo "Check interval: ${CHECK_INTERVAL}s"
echo ""
echo "Press Ctrl+C to stop"
echo ""

ATTEMPT=0
START_TIME=$(date +%s)

while true; do
    ATTEMPT=$((ATTEMPT + 1))
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    echo "[Attempt $ATTEMPT] $(date '+%H:%M:%S') - Checking VPS..."

    # Check 1: Ping
    if ping -c 1 -W 2 $VPS_IP &> /dev/null; then
        echo "  ✓ Ping successful"

        # Check 2: SSH
        if timeout 10 ssh -o ConnectTimeout=5 -o BatchMode=yes $VPS_HOST "echo 'SSH OK'" &> /dev/null; then
            echo "  ✓ SSH accessible"
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "✅ VPS IS ONLINE!"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "Time elapsed: $((ELAPSED / 60)) minutes $((ELAPSED % 60)) seconds"
            echo ""

            # Run quick diagnostics
            echo "Running quick diagnostics..."
            echo ""

            echo "=== Uptime ==="
            ssh $VPS_HOST "uptime"
            echo ""

            echo "=== Memory ==="
            ssh $VPS_HOST "free -h"
            echo ""

            echo "=== Disk ==="
            ssh $VPS_HOST "df -h /"
            echo ""

            echo "=== Docker Status ==="
            ssh $VPS_HOST "docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | head -10"
            echo ""

            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "📋 Next Steps:"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "1. Run full audit:"
            echo "   scp vps-resource-audit.sh staging-vps:/tmp/"
            echo "   ssh staging-vps '/tmp/vps-resource-audit.sh' > audit-report.txt"
            echo ""
            echo "2. Review the audit report:"
            echo "   cat audit-report.txt"
            echo ""
            echo "3. If resources are critical (>80%), run cleanup:"
            echo "   scp vps-cleanup-optimize.sh staging-vps:/tmp/"
            echo "   ssh staging-vps 'sudo /tmp/vps-cleanup-optimize.sh'"
            echo ""
            echo "4. See VPS_RECOVERY_GUIDE.md for full recovery steps"
            echo ""

            exit 0
        else
            echo "  ✗ SSH not accessible yet"
        fi
    else
        echo "  ✗ Ping timeout"
    fi

    echo "  Waiting ${CHECK_INTERVAL}s before retry..."
    echo ""

    sleep $CHECK_INTERVAL
done
