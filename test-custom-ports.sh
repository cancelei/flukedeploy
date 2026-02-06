#!/bin/bash
set -e

# FlukeDeploy Local Test with Custom Ports
# Runs side-by-side with CapRover

echo "=== FlukeDeploy Local Test with Custom Ports ==="
echo ""

# Generate password
ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-25)
echo "Admin Password: $ADMIN_PASSWORD"
echo "$ADMIN_PASSWORD" > /tmp/flukedeploy-test-password.txt

# Custom ports (avoid conflicts with CapRover)
HTTP_PORT=8080
HTTPS_PORT=8443
ADMIN_PORT=4000
REGISTRY_PORT=1996

echo ""
echo "Custom Ports:"
echo "  HTTP:     $HTTP_PORT (instead of 80)"
echo "  HTTPS:    $HTTPS_PORT (instead of 443)"
echo "  Admin:    $ADMIN_PORT (instead of 3000)"
echo "  Registry: $REGISTRY_PORT (instead of 996)"
echo ""

# Clean up any existing test deployment
docker service rm flukedeploy-test 2>/dev/null || true
sleep 2

echo "Deploying FlukeDeploy..."

docker service create \
  --name flukedeploy-test \
  --publish ${HTTP_PORT}:80 \
  --publish ${HTTPS_PORT}:443 \
  --publish ${ADMIN_PORT}:3000 \
  --publish ${REGISTRY_PORT}:996 \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=tmpfs,dst=/captain \
  --constraint 'node.role == manager' \
  --env "ACCEPTED_TERMS=true" \
  --env "CAPTAIN_ROOT_DOMAIN=local.test" \
  --env "CAPTAIN_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  --env "CAPTAIN_HOST_HTTP_PORT=${HTTP_PORT}" \
  --env "CAPTAIN_HOST_HTTPS_PORT=${HTTPS_PORT}" \
  --env "CAPTAIN_HOST_ADMIN_PORT=${ADMIN_PORT}" \
  --env "MAIN_NODE_IP_ADDRESS=127.0.0.1" \
  --env "BY_PASS_PROXY_CHECK=TRUE" \
  ghcr.io/cancelei/flukedeploy:latest

echo ""
echo "Waiting for FlukeDeploy to start..."
sleep 15

echo ""
echo "Service Status:"
docker service ps flukedeploy-test --no-trunc

echo ""
echo "=== FlukeDeploy Test Deployment Ready ==="
echo ""
echo "Access FlukeDeploy at:"
echo "  http://localhost:${ADMIN_PORT}"
echo ""
echo "Username: admin"
echo "Password: (saved in /tmp/flukedeploy-test-password.txt)"
echo ""
echo "View logs: docker service logs flukedeploy-test -f"
echo "Remove:    docker service rm flukedeploy-test"
echo ""
