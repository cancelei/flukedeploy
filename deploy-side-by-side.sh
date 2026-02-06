#!/bin/bash
set -e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚀 FlukeDeploy Side-by-Side Deployment (with CapRover)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Deploys FlukeDeploy on custom ports alongside CapRover
#
# Usage:
#   ./deploy-side-by-side.sh [OPTIONS]
#
# Options:
#   --vps HOST             VPS hostname (required)
#   --domain DOMAIN        Root domain (required)
#   --password PASSWORD    Admin password (auto-generated if not provided)
#   --image IMAGE          Docker image (default: ghcr.io/cancelei/flukedeploy:latest)
#   --yes, -y              Non-interactive mode
#   --help, -h             Show this help
#
# Custom Ports (to avoid CapRover conflicts):
#   HTTP:     8080 (instead of 80)
#   HTTPS:    8443 (instead of 443)
#   Admin:    4000 (instead of 3000)
#   Registry: 1996 (instead of 996)
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
VPS_HOST=""
DOMAIN=""
ADMIN_PASSWORD=""
IMAGE="ghcr.io/cancelei/flukedeploy:latest"
NON_INTERACTIVE="false"

# Custom ports
HTTP_PORT=8080
HTTPS_PORT=8443
ADMIN_PORT=4000
REGISTRY_PORT=1996

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}━━━ $1 ━━━${NC}\n"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --vps)
            VPS_HOST="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        -y|--yes)
            NON_INTERACTIVE="true"
            shift
            ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$VPS_HOST" ]; then
    log_error "VPS hostname is required. Use --vps staging-vps"
    exit 1
fi

if [ -z "$DOMAIN" ]; then
    log_error "Domain is required. Use --domain your-domain.com"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 FlukeDeploy Side-by-Side Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "VPS:    $VPS_HOST"
echo "Domain: $DOMAIN"
echo "Image:  $IMAGE"
echo ""
echo "Custom Ports:"
echo "  HTTP:     $HTTP_PORT (CapRover uses 80)"
echo "  HTTPS:    $HTTPS_PORT (CapRover uses 443)"
echo "  Admin:    $ADMIN_PORT (CapRover uses 3000)"
echo "  Registry: $REGISTRY_PORT (CapRover uses 996)"
echo ""

if [ "$NON_INTERACTIVE" != "true" ]; then
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read -r
fi

log_step "Step 1/5: Generating credentials"

if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    log_info "Generated admin password"
fi

PASSWORD_FILE="/root/.flukedeploy-side-by-side-password"
ssh "$VPS_HOST" "echo '$ADMIN_PASSWORD' | sudo tee $PASSWORD_FILE > /dev/null && sudo chmod 600 $PASSWORD_FILE"
log_info "Password saved to $PASSWORD_FILE on VPS"

log_step "Step 2/5: Creating directories"

ssh "$VPS_HOST" "sudo mkdir -p /flukedeploy-test/{data,config,ssl}"
log_info "Created /flukedeploy-test directories"

log_step "Step 3/5: Pulling Docker image"

log_info "Pulling $IMAGE..."
ssh "$VPS_HOST" "docker pull '$IMAGE'"
log_info "✓ Image pulled successfully"

log_step "Step 4/5: Checking for existing FlukeDeploy service"

if ssh "$VPS_HOST" "docker service ls | grep -q 'flukedeploy-test'"; then
    log_warn "FlukeDeploy test service already exists"
    if [ "$NON_INTERACTIVE" != "true" ]; then
        echo "Remove existing service? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            ssh "$VPS_HOST" "docker service rm flukedeploy-test"
            log_info "Removed existing service"
            sleep 5
        else
            log_error "Deployment cancelled"
            exit 1
        fi
    else
        ssh "$VPS_HOST" "docker service rm flukedeploy-test"
        log_info "Removed existing service"
        sleep 5
    fi
fi

log_step "Step 5/5: Deploying FlukeDeploy service"

log_info "Creating FlukeDeploy service with custom ports..."

ssh "$VPS_HOST" "docker service create \\
  --name flukedeploy-test \\
  --publish ${HTTP_PORT}:80 \\
  --publish ${HTTPS_PORT}:443 \\
  --publish ${ADMIN_PORT}:3000 \\
  --publish ${REGISTRY_PORT}:996 \\
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \\
  --mount type=bind,src=/flukedeploy-test,dst=/captain \\
  --constraint 'node.role == manager' \\
  --env 'ACCEPTED_TERMS=true' \\
  --env 'CAPTAIN_ROOT_DOMAIN=$DOMAIN' \\
  --env 'CAPTAIN_ADMIN_PASSWORD=$ADMIN_PASSWORD' \\
  --env 'CAPTAIN_HOST_HTTP_PORT=${HTTP_PORT}' \\
  --env 'CAPTAIN_HOST_HTTPS_PORT=${HTTPS_PORT}' \\
  --env 'CAPTAIN_HOST_ADMIN_PORT=${ADMIN_PORT}' \\
  '$IMAGE' > /dev/null"

log_info "✓ Service created"

log_info "Waiting for FlukeDeploy to start..."
sleep 15

# Check service status
SERVICE_STATE=$(ssh "$VPS_HOST" "docker service ps flukedeploy-test --format '{{.CurrentState}}' 2>/dev/null | head -1")
log_info "Service state: $SERVICE_STATE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ FlukeDeploy Deployed Side-by-Side!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "FlukeDeploy Access:"
echo "  Web UI:    http://$DOMAIN:${ADMIN_PORT}"
echo "  HTTP:      http://$DOMAIN:${HTTP_PORT}"
echo "  HTTPS:     https://$DOMAIN:${HTTPS_PORT}"
echo ""
echo "CapRover Access (unchanged):"
echo "  Web UI:    http://$DOMAIN:3000"
echo "  HTTP:      http://$DOMAIN (port 80)"
echo "  HTTPS:     https://$DOMAIN (port 443)"
echo ""
echo "FlukeDeploy Credentials:"
echo "  Username:  admin"
echo "  Password:  (saved in $PASSWORD_FILE on VPS)"
echo ""
echo "Commands:"
echo "  View logs:   ssh $VPS_HOST 'docker service logs flukedeploy-test -f'"
echo "  Check status: ssh $VPS_HOST 'docker service ps flukedeploy-test'"
echo "  Remove:      ssh $VPS_HOST 'docker service rm flukedeploy-test'"
echo ""
echo "Note: Both CapRover and FlukeDeploy are now running simultaneously"
echo "      on different ports, sharing the same Docker Swarm cluster."
echo ""
