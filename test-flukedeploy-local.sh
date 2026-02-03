#!/bin/bash

set -e

echo "🚀 FlukeDeploy Local Test Script"
echo "================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Must run as sudo"
    echo "Usage: sudo ./test-flukedeploy-local.sh"
    exit 1
fi

# Check if Docker Swarm is initialized
if ! docker node ls > /dev/null 2>&1; then
    echo "⚠️  Docker Swarm not initialized"
    echo "Initializing Docker Swarm..."
    docker swarm init --advertise-addr 127.0.0.1
fi

echo ""
echo "📦 Building FlukeDeploy debug image..."
docker build -t flukedeploy-debug -f dockerfile-flukedeploy.debug .

echo ""
echo "🧹 Cleaning up old installation..."
# Remove old services
docker service rm $(docker service ls -q) 2>/dev/null || true
sleep 2

# Remove old secrets
docker secret rm flukedeploy-salt 2>/dev/null || true

# Clean up data directory
rm -rf /flukedeploy 2>/dev/null || true
mkdir -p /flukedeploy/data/shared-logs
chmod -R 777 /flukedeploy

echo ""
echo "🎯 Starting FlukeDeploy..."
docker run \
    --rm \
    --name flukedeploy-test \
    -e "CAPTAIN_IS_DEBUG=1" \
    -e "MAIN_NODE_IP_ADDRESS=127.0.0.1" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /flukedeploy:/captain \
    -v $(pwd):/usr/src/app \
    -p 3000:3000 \
    -p 80:80 \
    -p 443:443 \
    -p 8767:8767 \
    flukedeploy-debug

echo ""
echo "✅ FlukeDeploy started!"
echo "   - Web UI: http://localhost:3000"
echo "   - WebSocket: ws://localhost:8767"
echo ""
