#!/bin/bash
set -e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔄 CapRover → FlukeDeploy Migration Script
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# This script migrates an existing CapRover installation to FlukeDeploy
# while preserving all applications and data.
#
# Usage:
#   ./migrate-from-caprover.sh [OPTIONS]
#
# Options:
#   --yes, -y              Non-interactive mode (auto-approve all prompts)
#   --backup-only          Only backup CapRover data, don't migrate
#   --skip-backup          Skip backup step (dangerous!)
#   --domain DOMAIN        FlukeDeploy root domain (default: from CapRover)
#   --admin-password PWD   Admin password (default: from CapRover)
#   --help, -h             Show this help message
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NON_INTERACTIVE="false"
BACKUP_ONLY="false"
SKIP_BACKUP="false"
DOMAIN=""
ADMIN_PASSWORD=""
BACKUP_DIR="/var/caprover-backup-$(date +%Y%m%d-%H%M%S)"
CAPROVER_ROOT="/captain"
FLUKEDEPLOY_VERSION="${FLUKEDEPLOY_VERSION:-latest}"

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

log_step() {
    echo -e "\n${BLUE}━━━ $1 ━━━${NC}\n"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive)
            NON_INTERACTIVE="true"
            shift
            ;;
        --backup-only)
            BACKUP_ONLY="true"
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP="true"
            shift
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

# Check if CapRover is running
if ! docker service ls | grep -q captain-captain; then
    log_error "CapRover is not running on this system"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 CapRover → FlukeDeploy Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script will migrate your CapRover installation to FlukeDeploy."
echo ""
echo "What will happen:"
echo "  1. Backup CapRover data and configurations"
echo "  2. Export application definitions"
echo "  3. Stop CapRover services"
echo "  4. Deploy FlukeDeploy"
echo "  5. Restore applications to FlukeDeploy"
echo ""
log_warn "This process will cause temporary downtime for your applications."
echo ""

if [ "$NON_INTERACTIVE" != "true" ]; then
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read -r
else
    log_info "Running in non-interactive mode..."
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Backup CapRover Data
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$SKIP_BACKUP" != "true" ]; then
    log_step "Step 1/5: Backing up CapRover data"

    mkdir -p "$BACKUP_DIR"
    log_info "Backup directory: $BACKUP_DIR"

    # Backup CapRover root directory
    log_info "Backing up CapRover configuration..."
    if [ -d "$CAPROVER_ROOT" ]; then
        cp -r "$CAPROVER_ROOT" "$BACKUP_DIR/captain-root"
        log_info "✓ Backed up $CAPROVER_ROOT"
    else
        log_warn "CapRover root directory not found at $CAPROVER_ROOT"
    fi

    # Export CapRover service definitions
    log_info "Exporting Docker service definitions..."
    docker service ls --format "{{.Name}}" | grep "^captain-\|^srv-captain--" > "$BACKUP_DIR/services.txt"

    while IFS= read -r service; do
        docker service inspect "$service" > "$BACKUP_DIR/service-${service}.json" 2>/dev/null || true
    done < "$BACKUP_DIR/services.txt"

    log_info "✓ Exported $(wc -l < "$BACKUP_DIR/services.txt") service definitions"

    # Export CapRover configuration from captain-captain
    log_info "Extracting CapRover configuration..."
    docker exec $(docker ps -q -f name=captain-captain) \
        cat /captain/data/config-captain.json 2>/dev/null > "$BACKUP_DIR/config-captain.json" || true

    # Extract domain and password from CapRover config
    if [ -f "$BACKUP_DIR/config-captain.json" ]; then
        if [ -z "$DOMAIN" ]; then
            DOMAIN=$(grep -oP '"rootDomain"\s*:\s*"\K[^"]+' "$BACKUP_DIR/config-captain.json" || echo "")
        fi
        if [ -z "$ADMIN_PASSWORD" ]; then
            ADMIN_PASSWORD=$(grep -oP '"hashedPassword"\s*:\s*"\K[^"]+' "$BACKUP_DIR/config-captain.json" || echo "")
        fi
    fi

    # Create migration manifest
    cat > "$BACKUP_DIR/migration-manifest.json" <<EOF
{
    "migration_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "caprover_version": "$(docker service inspect captain-captain --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || echo 'unknown')",
    "domain": "$DOMAIN",
    "backup_dir": "$BACKUP_DIR",
    "service_count": $(wc -l < "$BACKUP_DIR/services.txt"),
    "backup_size_mb": $(du -sm "$BACKUP_DIR" | cut -f1)
}
EOF

    log_info "✓ Backup completed: $BACKUP_DIR"
    log_info "  Size: $(du -sh "$BACKUP_DIR" | cut -f1)"

    if [ "$BACKUP_ONLY" = "true" ]; then
        log_info "Backup-only mode enabled. Exiting without migration."
        exit 0
    fi
else
    log_warn "Skipping backup step (--skip-backup flag)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Export Application Definitions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "Step 2/5: Exporting application definitions"

mkdir -p "$BACKUP_DIR/apps"

# Get list of user applications (exclude CapRover core services)
docker service ls --format "{{.Name}}" | grep "^srv-captain--" | sed 's/^srv-captain--//' > "$BACKUP_DIR/app-names.txt"

APP_COUNT=$(wc -l < "$BACKUP_DIR/app-names.txt")
log_info "Found $APP_COUNT applications"

while IFS= read -r app_name; do
    log_info "Exporting: $app_name"

    service_name="srv-captain--${app_name}"
    app_dir="$BACKUP_DIR/apps/$app_name"
    mkdir -p "$app_dir"

    # Export service definition
    docker service inspect "$service_name" > "$app_dir/service.json" 2>/dev/null || true

    # Extract key configuration
    REPLICAS=$(docker service inspect "$service_name" --format '{{.Spec.Mode.Replicated.Replicas}}' 2>/dev/null || echo "1")
    IMAGE=$(docker service inspect "$service_name" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || echo "")

    # Extract environment variables
    docker service inspect "$service_name" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' 2>/dev/null > "$app_dir/env-vars.txt" || true

    # Extract volumes/mounts
    docker service inspect "$service_name" --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}' 2>/dev/null > "$app_dir/mounts.json" || true

    # Create app manifest for FlukeDeploy
    cat > "$app_dir/manifest.json" <<EOF
{
    "appName": "$app_name",
    "serviceName": "$service_name",
    "image": "$IMAGE",
    "replicas": $REPLICAS,
    "exported_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

done < "$BACKUP_DIR/app-names.txt"

log_info "✓ Exported $APP_COUNT applications"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Stop CapRover Services
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "Step 3/5: Stopping CapRover services"

log_warn "This will stop all CapRover services and cause downtime."

if [ "$NON_INTERACTIVE" != "true" ]; then
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read -r
fi

# Scale down user applications first (graceful shutdown)
log_info "Scaling down user applications..."
while IFS= read -r app_name; do
    service_name="srv-captain--${app_name}"
    log_info "  Scaling down: $app_name"
    docker service scale "$service_name=0" 2>/dev/null || true
done < "$BACKUP_DIR/app-names.txt"

sleep 5

# Stop CapRover core services
log_info "Stopping CapRover core services..."
CORE_SERVICES="captain-captain captain-nginx captain-certbot captain-registry"

for service in $CORE_SERVICES; do
    if docker service ls | grep -q "$service"; then
        log_info "  Removing: $service"
        docker service rm "$service" 2>/dev/null || true
    fi
done

log_info "✓ CapRover services stopped"

# Verify ports are freed
sleep 5
if netstat -tuln | grep -q ":80 "; then
    log_error "Port 80 is still in use. Cannot proceed."
    exit 1
fi

log_info "✓ Ports 80, 443, 3000 are now available"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Deploy FlukeDeploy
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "Step 4/5: Deploying FlukeDeploy"

# Use extracted domain or default
if [ -z "$DOMAIN" ]; then
    DOMAIN="localhost"
    log_warn "No domain found in CapRover config, using: $DOMAIN"
else
    log_info "Using domain from CapRover: $DOMAIN"
fi

# Generate new admin password if not provided
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    log_info "Generated new admin password (saved to /root/.flukedeploy-admin-password)"
    echo "$ADMIN_PASSWORD" > /root/.flukedeploy-admin-password
    chmod 600 /root/.flukedeploy-admin-password
else
    log_info "Using provided admin password"
fi

# Create FlukeDeploy directories
log_info "Creating FlukeDeploy directories..."
mkdir -p /flukedeploy/{data,config,ssl}

# Create FlukeDeploy configuration
log_info "Creating FlukeDeploy configuration..."
cat > /flukedeploy/config/flukedeploy.json <<EOF
{
    "rootDomain": "$DOMAIN",
    "adminPassword": "$ADMIN_PASSWORD",
    "migratedFromCapRover": true,
    "migrationDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backupLocation": "$BACKUP_DIR"
}
EOF

# Check if FlukeDeploy image exists
if ! docker image inspect flukedeploy:$FLUKEDEPLOY_VERSION &> /dev/null; then
    log_error "FlukeDeploy image not found: flukedeploy:$FLUKEDEPLOY_VERSION"
    log_info "Please build the image first or specify a different version"
    exit 1
fi

log_info "Deploying FlukeDeploy service..."

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
  --env "MIGRATED_FROM_CAPROVER=true" \
  flukedeploy:$FLUKEDEPLOY_VERSION

log_info "Waiting for FlukeDeploy to start..."
sleep 10

# Check if FlukeDeploy is running
MAX_WAIT=60
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if docker service ps flukedeploy --format "{{.CurrentState}}" | grep -q "Running"; then
        log_info "✓ FlukeDeploy is running"
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    log_error "FlukeDeploy failed to start within ${MAX_WAIT}s"
    log_error "Check logs: docker service logs flukedeploy"
    exit 1
fi

# Verify FlukeDeploy API is accessible
sleep 5
if curl -f -s http://localhost:3000/api/v1/user/system/info &> /dev/null; then
    log_info "✓ FlukeDeploy API is accessible"
else
    log_warn "FlukeDeploy API not yet accessible (may take a few more seconds)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Restore Applications
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "Step 5/5: Restoring applications to FlukeDeploy"

log_info "Restoring $APP_COUNT applications..."

# Scale up user applications (they should still exist in Docker Swarm)
SUCCESS_COUNT=0
FAILED_COUNT=0

while IFS= read -r app_name; do
    service_name="srv-captain--${app_name}"
    app_dir="$BACKUP_DIR/apps/$app_name"

    # Get original replica count
    REPLICAS=$(grep -oP '"replicas":\s*\K\d+' "$app_dir/manifest.json" || echo "1")

    log_info "Restoring: $app_name (replicas: $REPLICAS)"

    # Check if service still exists
    if docker service ls | grep -q "$service_name"; then
        # Scale back up
        if docker service scale "$service_name=$REPLICAS" &> /dev/null; then
            log_info "  ✓ $app_name restored"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            log_error "  ✗ Failed to restore $app_name"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    else
        log_warn "  ⚠ Service $service_name not found (may need manual recreation)"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done < "$BACKUP_DIR/app-names.txt"

log_info "✓ Restoration complete: $SUCCESS_COUNT succeeded, $FAILED_COUNT failed"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Migration Complete
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_info "FlukeDeploy is now running at: http://$DOMAIN"
log_info "Admin panel: http://$DOMAIN:3000"
log_info ""
log_info "Admin credentials:"
log_info "  Username: admin@$DOMAIN"
log_info "  Password: (saved to /root/.flukedeploy-admin-password)"
echo ""
log_info "Backup location: $BACKUP_DIR"
log_info "Applications restored: $SUCCESS_COUNT/$APP_COUNT"
echo ""

if [ $FAILED_COUNT -gt 0 ]; then
    log_warn "Some applications failed to restore. Check logs and backup at:"
    log_warn "  $BACKUP_DIR/apps/"
fi

echo ""
log_info "Next steps:"
echo "  1. Verify applications are working: docker service ls"
echo "  2. Access FlukeDeploy UI: http://$DOMAIN:3000"
echo "  3. Check logs: docker service logs flukedeploy"
echo "  4. Keep backup safe: $BACKUP_DIR"
echo ""
