#!/bin/bash
set -e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚀 FlukeDeploy Quick Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Deploys FlukeDeploy using pre-built image from GitHub Container Registry
#
# Usage:
#   ./deploy-flukedeploy.sh [OPTIONS]
#
# Options:
#   --domain DOMAIN        Root domain (required)
#   --password PASSWORD    Admin password (auto-generated if not provided)
#   --image IMAGE          Docker image (default: ghcr.io/cancelei/flukedeploy:latest)
#   --yes, -y              Non-interactive mode
#   --help, -h             Show this help
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN=""
ADMIN_PASSWORD=""
IMAGE="ghcr.io/cancelei/flukedeploy:latest"
NON_INTERACTIVE="false"

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
if [ -z "$DOMAIN" ]; then
    log_error "Domain is required. Use --domain your-domain.com"
    exit 1
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

# Check Docker Swarm
SWARM_STATE=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
if [ "$SWARM_STATE" != "active" ]; then
    log_error "Docker Swarm is not active. Initialize with: docker swarm init"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 FlukeDeploy Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Domain: $DOMAIN"
echo "Image:  $IMAGE"
echo ""

if [ "$NON_INTERACTIVE" != "true" ]; then
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read -r
fi

log_step "Step 1/4: Generating credentials"

if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    log_info "Generated admin password"
fi

echo "$ADMIN_PASSWORD" > /root/.flukedeploy-admin-password
chmod 600 /root/.flukedeploy-admin-password
log_info "Password saved to /root/.flukedeploy-admin-password"

log_step "Step 2/4: Creating directories"

mkdir -p /flukedeploy/{data,config,ssl}
log_info "Created /flukedeploy directories"

log_step "Step 3/4: Pulling Docker image"

log_info "Pulling $IMAGE..."
docker pull "$IMAGE"
log_info "✓ Image pulled successfully"

log_step "Step 4/4: Deploying FlukeDeploy service"

# Check if service already exists
if docker service ls | grep -q "flukedeploy"; then
    log_warn "FlukeDeploy service already exists"
    if [ "$NON_INTERACTIVE" != "true" ]; then
        echo "Remove existing service? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            docker service rm flukedeploy
            log_info "Removed existing service"
            sleep 5
        else
            log_error "Deployment cancelled"
            exit 1
        fi
    else
        docker service rm flukedeploy
        log_info "Removed existing service"
        sleep 5
    fi
fi

log_info "Creating FlukeDeploy service..."

docker service create \
  --name flukedeploy \
  --publish 80:80 \
  --publish 443:443 \
  --publish 3000:3000 \
  --publish 8767:8767 \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=bind,src=/flukedeploy,dst=/captain \
  --constraint 'node.role == manager' \
  --env "ACCEPTED_TERMS=true" \
  --env "CAPTAIN_ROOT_DOMAIN=$DOMAIN" \
  --env "CAPTAIN_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  "$IMAGE" > /dev/null

log_info "✓ Service created"

log_info "Waiting for FlukeDeploy to start..."
sleep 15

# Check service status
SERVICE_STATE=$(docker service ps flukedeploy --format "{{.CurrentState}}" 2>/dev/null | head -1)
log_info "Service state: $SERVICE_STATE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ FlukeDeploy Deployed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Web UI:    http://$DOMAIN:3000"
echo "           https://captain.$DOMAIN"
echo ""
echo "Username:  admin"
echo "Password:  (saved in /root/.flukedeploy-admin-password)"
echo ""
echo "Next steps:"
echo "  1. Access the web UI and complete initial setup"
echo "  2. Configure Let's Encrypt for HTTPS"
echo "  3. Deploy your first application"
echo ""
echo "Monitor logs: docker service logs flukedeploy -f"
echo "Check status:  docker service ps flukedeploy"
echo ""
