#!/bin/bash
#
# FlukeDeploy One-Command Installation Script
# AI-friendly installation for fresh VPS
#
# Usage:
#   curl -sSL https://get.flukedeploy.com | sudo bash
#   Or: ./install-flukedeploy.sh --domain deploy.example.com --email admin@example.com
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
FLUKEDEPLOY_VERSION="latest"
DOMAIN=""
EMAIL=""
HTTPS_ENABLED="true"
AUTO_GENERATE_PASSWORD="true"
ADMIN_PASSWORD=""
FLUKEBASE_API_TOKEN=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --no-https)
            HTTPS_ENABLED="false"
            shift
            ;;
        --password)
            ADMIN_PASSWORD="$2"
            AUTO_GENERATE_PASSWORD="false"
            shift 2
            ;;
        --flukebase-token)
            FLUKEBASE_API_TOKEN="$2"
            shift 2
            ;;
        --version)
            FLUKEDEPLOY_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            cat <<EOF
FlukeDeploy Installation Script

Usage: $0 [OPTIONS]

Options:
  --domain DOMAIN           Domain name (default: localhost)
  --email EMAIL            Admin email for Let's Encrypt
  --no-https               Disable HTTPS
  --password PASSWORD      Set admin password (auto-generated if not provided)
  --flukebase-token TOKEN  FlukeBase API token for integration
  --version VERSION        FlukeDeploy version (default: latest)
  -h, --help               Show this help message

Examples:
  # Basic installation
  $0

  # With custom domain
  $0 --domain deploy.example.com --email admin@example.com

  # With FlukeBase integration
  $0 --flukebase-token fbk_your_token_here

EOF
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        echo "Please run: sudo $0"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check OS
    if [ ! -f /etc/os-release ]; then
        log_error "Cannot detect OS. /etc/os-release not found"
        exit 1
    fi

    . /etc/os-release
    log_info "Detected OS: $NAME $VERSION"

    # Check architecture
    ARCH=$(uname -m)
    if [[ ! "$ARCH" =~ ^(x86_64|aarch64|arm64)$ ]]; then
        log_error "Unsupported architecture: $ARCH"
        exit 1
    fi
    log_info "Architecture: $ARCH"

    # Check minimum requirements
    TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_MEM" -lt 1024 ]; then
        log_warn "Low memory detected: ${TOTAL_MEM}MB (minimum recommended: 1GB)"
    fi

    TOTAL_DISK=$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$TOTAL_DISK" -lt 10 ]; then
        log_warn "Low disk space: ${TOTAL_DISK}GB free (minimum recommended: 10GB)"
    fi
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log_info "Docker already installed: $(docker --version)"
        return 0
    fi

    log_info "Installing Docker..."

    # Install Docker using official script
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Start Docker service
    systemctl start docker
    systemctl enable docker

    log_info "Docker installed: $(docker --version)"
}

# Initialize Docker Swarm
init_swarm() {
    if docker node ls &> /dev/null; then
        log_info "Docker Swarm already initialized"
        return 0
    fi

    log_info "Initializing Docker Swarm..."

    # Get primary IP
    PRIMARY_IP=$(hostname -I | awk '{print $1}')
    log_info "Using IP address: $PRIMARY_IP"

    # Initialize swarm
    docker swarm init --advertise-addr "$PRIMARY_IP"

    log_info "Docker Swarm initialized"
}

# Generate admin credentials
generate_credentials() {
    if [ "$AUTO_GENERATE_PASSWORD" = "true" ]; then
        log_info "Generating admin credentials..."

        # Generate secure password
        ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

        # Save to file
        echo "$ADMIN_PASSWORD" > /root/.flukedeploy-admin-password
        chmod 600 /root/.flukedeploy-admin-password

        log_info "Admin password generated and saved to /root/.flukedeploy-admin-password"
    else
        log_info "Using provided admin password"
    fi
}

# Create configuration
create_config() {
    log_info "Creating configuration..."

    mkdir -p /flukedeploy/config

    cat > /flukedeploy/config/flukedeploy.json <<EOF
{
    "version": "1.0",
    "domain": "${DOMAIN:-localhost}",
    "email": "${EMAIL:-admin@localhost}",
    "https_enabled": ${HTTPS_ENABLED},
    "websocket_port": 8767,
    "logging": {
        "format": "json-ld",
        "retention_days": 30
    },
    "monitoring": {
        "websocket_enabled": true,
        "metrics_enabled": true
    },
    "flukebase_integration": {
        "enabled": $([ -n "$FLUKEBASE_API_TOKEN" ] && echo "true" || echo "false"),
        "api_url": "https://flukebase.me/api/v1",
        "api_token": "${FLUKEBASE_API_TOKEN}"
    }
}
EOF

    log_info "Configuration saved to /flukedeploy/config/flukedeploy.json"
}

# Create data directories
create_directories() {
    log_info "Creating data directories..."

    mkdir -p /flukedeploy/data/nginx/conf.d
    mkdir -p /flukedeploy/data/nginx/ssl
    mkdir -p /flukedeploy/data/config
    mkdir -p /flukedeploy/data/shared-logs
    mkdir -p /flukedeploy/data/registry
    mkdir -p /flukedeploy/data/letsencrypt

    chmod -R 755 /flukedeploy

    log_info "Data directories created"
}

# Pull FlukeDeploy image
pull_image() {
    log_info "Pulling FlukeDeploy Docker image (version: $FLUKEDEPLOY_VERSION)..."

    # For now, we'll build locally since image isn't on Docker Hub yet
    if [ -d "$(pwd)/src" ]; then
        log_info "Building from source (development mode)..."
        docker build -t flukedeploy:$FLUKEDEPLOY_VERSION -f dockerfile-flukedeploy.release .
    else
        log_warn "Source not found, attempting to pull from registry..."
        docker pull flukebase/flukedeploy:$FLUKEDEPLOY_VERSION || {
            log_error "Failed to pull image and no source found"
            exit 1
        }
    fi

    log_info "FlukeDeploy image ready"
}

# Deploy FlukeDeploy service
deploy_service() {
    log_info "Deploying FlukeDeploy service..."

    # Remove old service if exists
    if docker service ls | grep -q flukedeploy; then
        log_info "Removing old FlukeDeploy service..."
        docker service rm flukedeploy
        sleep 5
    fi

    # Create service
    docker service create \
        --name flukedeploy \
        --publish 80:80 \
        --publish 443:443 \
        --publish 3000:3000 \
        --publish 8767:8767 \
        --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
        --mount type=bind,src=/flukedeploy,dst=/captain \
        --env "ACCEPTED_TERMS=true" \
        --env "CAPTAIN_ROOT_DOMAIN=${DOMAIN:-localhost}" \
        --env "CAPTAIN_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
        --env "FLUKEBASE_API_TOKEN=${FLUKEBASE_API_TOKEN}" \
        --constraint 'node.role==manager' \
        --replicas 1 \
        flukedeploy:$FLUKEDEPLOY_VERSION

    log_info "FlukeDeploy service deployed"
}

# Wait for service to be ready
wait_for_service() {
    log_info "Waiting for FlukeDeploy to be ready..."

    for i in {1..60}; do
        if curl -sf http://localhost:3000/api/v1/health &> /dev/null; then
            log_info "FlukeDeploy is ready!"
            return 0
        fi

        if [ $((i % 10)) -eq 0 ]; then
            log_info "Still waiting... ($i/60 seconds)"
        fi

        sleep 1
    done

    log_error "FlukeDeploy did not start within 60 seconds"
    log_info "Check logs with: docker service logs flukedeploy"
    return 1
}

# Print installation summary
print_summary() {
    cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ FlukeDeploy Installation Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Access URLs:
   Web UI:    http://${DOMAIN:-localhost}:3000
   API:       http://${DOMAIN:-localhost}:3000/api/v1
   WebSocket: ws://${DOMAIN:-localhost}:8767

🔐 Admin Credentials:
   Username: admin
   Password: $ADMIN_PASSWORD

   ⚠️  Password saved to: /root/.flukedeploy-admin-password
   Keep this secure!

📊 System Information:
   Version: $FLUKEDEPLOY_VERSION
   Domain: ${DOMAIN:-localhost}
   HTTPS: ${HTTPS_ENABLED}
   FlukeBase Integration: $([ -n "$FLUKEBASE_API_TOKEN" ] && echo "Enabled" || echo "Disabled")

📚 Next Steps:
   1. Access the web UI at http://${DOMAIN:-localhost}:3000
   2. Login with the credentials above
   3. Complete the initial setup wizard
   4. Deploy your first application!

📖 Documentation: https://docs.flukedeploy.com
💬 Support: https://github.com/flukebase/flukedeploy/issues

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

    # Save installation info
    cat > /flukedeploy/installation-info.txt <<EOF
FlukeDeploy Installation
========================
Date: $(date)
Version: $FLUKEDEPLOY_VERSION
Domain: ${DOMAIN:-localhost}
Admin Password: $ADMIN_PASSWORD

Access:
- Web UI: http://${DOMAIN:-localhost}:3000
- API: http://${DOMAIN:-localhost}:3000/api/v1
- WebSocket: ws://${DOMAIN:-localhost}:8767
EOF

    log_info "Installation info saved to /flukedeploy/installation-info.txt"
}

# Main installation flow
main() {
    cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 FlukeDeploy Installation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This script will install FlukeDeploy on your system.
It will:
  • Install Docker (if needed)
  • Initialize Docker Swarm
  • Deploy FlukeDeploy service
  • Configure monitoring & logging

Press Ctrl+C to cancel, or Enter to continue...
EOF

    read -r

    check_root
    check_prerequisites
    install_docker
    init_swarm
    generate_credentials
    create_config
    create_directories
    pull_image
    deploy_service

    if wait_for_service; then
        print_summary
        exit 0
    else
        log_error "Installation failed - please check the logs"
        exit 1
    fi
}

# Run main installation
main
