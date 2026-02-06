#!/bin/bash
set -e

# Configuration
VPS="staging-vps"
DOMAIN="flukebase.me"
IMAGE="ghcr.io/cancelei/flukedeploy:latest"
SERVICE_NAME="flukedeploy"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 FlukeDeploy Production Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "VPS:    $VPS"
echo "Domain: $DOMAIN"
echo "Image:  $IMAGE"
echo ""
echo "Standard Ports:"
echo "  HTTP:  80"
echo "  HTTPS: 443"
echo "  Admin: 3000"
echo ""

# Generate admin password
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d "=+/" | cut -c1-25)

echo "━━━ Step 1/5: Saving credentials ━━━"
echo ""
echo "$ADMIN_PASSWORD" > /tmp/flukedeploy-production-password.txt
echo "[INFO] Admin password saved to /tmp/flukedeploy-production-password.txt"
echo "[INFO] Password will also be saved to VPS at /root/.flukedeploy-password"
echo ""

# Save password to VPS
ssh "$VPS" "echo '$ADMIN_PASSWORD' > /root/.flukedeploy-password"

echo "━━━ Step 2/5: Pulling Docker image ━━━"
echo ""
echo "[INFO] Pulling $IMAGE..."
ssh "$VPS" "docker pull $IMAGE"
echo "[INFO] ✓ Image pulled successfully"
echo ""

echo "━━━ Step 3/5: Checking for existing FlukeDeploy service ━━━"
echo ""
if ssh "$VPS" "docker service inspect $SERVICE_NAME >/dev/null 2>&1"; then
    echo "[WARN] FlukeDeploy service already exists, removing..."
    ssh "$VPS" "docker service rm $SERVICE_NAME"
    echo "[INFO] ✓ Old service removed"
fi
echo ""

echo "━━━ Step 4/5: Deploying FlukeDeploy service ━━━"
echo ""
echo "[INFO] Creating FlukeDeploy service on standard ports..."

# Deploy service
ssh "$VPS" "docker service create \
  --name $SERVICE_NAME \
  --network captain-overlay-network \
  --publish 80:80 \
  --publish 443:443 \
  --publish 3000:3000 \
  --publish 996:996 \
  --publish 8767:8767 \
  --env 'CAPTAIN_ROOT_DOMAIN=$DOMAIN' \
  --env 'CAPTAIN_ADMIN_PASSWORD=$ADMIN_PASSWORD' \
  --env 'CAPTAIN_DOCKER_API=unix:///var/run/docker.sock' \
  --env 'BY_PASS_PROXY_CHECK=TRUE' \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
  --mount type=bind,source=/captain,target=/captain \
  --constraint node.role==manager \
  --restart-condition any \
  --update-delay 10s \
  $IMAGE"

echo "[INFO] ✓ Service created"
echo ""

echo "━━━ Step 5/5: Waiting for FlukeDeploy to start ━━━"
echo ""
echo "[INFO] Waiting for FlukeDeploy to start..."
sleep 10

# Check service status
SERVICE_STATE=$(ssh "$VPS" "docker service ps $SERVICE_NAME --format '{{.CurrentState}}' | head -n 1")
echo "[INFO] Service state: $SERVICE_STATE"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ FlukeDeploy Deployed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "FlukeDeploy Access:"
echo "  Web UI:    http://$DOMAIN:3000"
echo "  HTTP:      http://$DOMAIN"
echo "  HTTPS:     https://$DOMAIN"
echo ""
echo "FlukeDeploy Credentials:"
echo "  Username:  admin"
echo "  Password:  $ADMIN_PASSWORD"
echo "  (saved in /tmp/flukedeploy-production-password.txt)"
echo "  (also on VPS: /root/.flukedeploy-password)"
echo ""
echo "Commands:"
echo "  View logs:   ssh $VPS 'docker service logs $SERVICE_NAME -f'"
echo "  Check status: ssh $VPS 'docker service ps $SERVICE_NAME'"
echo "  Remove:      ssh $VPS 'docker service rm $SERVICE_NAME'"
echo ""
echo "Next Steps:"
echo "1. Access http://$DOMAIN:3000 and complete setup"
echo "2. Use password: $ADMIN_PASSWORD"
echo "3. After setup, restore databases from /root/caprover-migration-backup/"
echo ""
