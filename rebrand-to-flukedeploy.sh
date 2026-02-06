#!/bin/bash
# FlukeDeploy Comprehensive Rebranding Script
# Systematically replaces all CapRover/captain references with FlukeDeploy equivalents

set -e

echo "🚀 Starting FlukeDeploy Comprehensive Rebranding..."

# Create backup
BACKUP_DIR="flukedeploy-rebrand-backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup in $BACKUP_DIR..."
mkdir -p "../$BACKUP_DIR"
cp -r . "../$BACKUP_DIR/"

cd "$(dirname "$0")"

# Function to replace in all files
replace_in_files() {
    local old="$1"
    local new="$2"
    local desc="$3"

    echo "  Replacing: $desc"
    find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -exec sed -i "s/$old/$new/g" {} +
}

echo ""
echo "📝 Phase 1: Class and Interface Names"
replace_in_files "class CaptainError" "class FlukeDeployError" "CaptainError class name"
replace_in_files "CaptainError" "FlukeDeployError" "CaptainError references"
replace_in_files "captainErrorType" "flukedeployErrorType" "Error type property"
replace_in_files "class CaptainManager" "class FlukeDeployManager" "CaptainManager class name"
replace_in_files "CaptainManager" "FlukeDeployManager" "CaptainManager references"
replace_in_files "ICaptainDefinition" "IFlukeDeployDefinition" "Interface definition"
replace_in_files "CaptainEncryptor" "FlukeDeployEncryptor" "Encryptor class"

echo ""
echo "📝 Phase 2: Property and Variable Names"
replace_in_files "captainDefinitionContent" "flukedeployDefinitionContent" "Definition content property"
replace_in_files "captainDefinitionRelativeFilePath" "flukedeployDefinitionRelativeFilePath" "Definition file path"
replace_in_files "captainDefinitionContentSource" "flukedeployDefinitionContentSource" "Definition source"
replace_in_files "captainIpAddress" "flukedeployIpAddress" "IP address variable"
replace_in_files "captainRegistryUsername" "flukedeployRegistryUsername" "Registry username"

echo ""
echo "📝 Phase 3: Constants and Configuration"
replace_in_files "captainSubDomain" "flukedeploySubDomain" "Subdomain constant"
replace_in_files "captainStaticFilesDir" "flukedeployStaticFilesDir" "Static files directory"
replace_in_files "captainConfirmationPath" "flukedeployConfirmationPath" "Confirmation path"
replace_in_files "captainBaseDirectory" "flukedeployBaseDirectory" "Base directory"
replace_in_files "captainRootDirectoryTemp" "flukedeployRootDirectoryTemp" "Temp directory"
replace_in_files "captainRootDirectoryBackup" "flukedeployRootDirectoryBackup" "Backup directory"
replace_in_files "captainDownloadsDirectory" "flukedeployDownloadsDirectory" "Downloads directory"
replace_in_files "captainRawSourceDirectoryBase" "flukedeployRawSourceDirectoryBase" "Raw source directory"
replace_in_files "captainRootDirectoryGenerated" "flukedeployRootDirectoryGenerated" "Generated directory"
replace_in_files "captainDataDirectory" "flukedeployDataDirectory" "Data directory"
replace_in_files "captainSaltSecretKey" "fluke deploySaltSecretKey" "Salt secret key"
replace_in_files "captainServiceName" "flukedeployServiceName" "Service name"
replace_in_files "captainNetworkName" "flukedeployNetworkName" "Network name"

echo ""
echo "📝 Phase 4: Environment Variables"
replace_in_files "CAPTAIN_BASE_DIRECTORY" "FLUKEDEPLOY_BASE_DIRECTORY" "BASE_DIRECTORY env var"
replace_in_files "CAPTAIN_DATA_DIRECTORY" "FLUKEDEPLOY_DATA_DIRECTORY" "DATA_DIRECTORY env var"
replace_in_files "CAPTAIN_ROOT_DIRECTORY_TEMP" "FLUKEDEPLOY_ROOT_DIRECTORY_TEMP" "ROOT_DIRECTORY_TEMP env var"
replace_in_files "CAPTAIN_ROOT_DIRECTORY_GENERATED" "FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED" "ROOT_DIRECTORY_GENERATED env var"
replace_in_files "CAPTAIN_DOCKER_API" "FLUKEDEPLOY_DOCKER_API" "DOCKER_API env var"
replace_in_files "CAPTAIN_IS_DEBUG" "FLUKEDEPLOY_IS_DEBUG" "IS_DEBUG env var"
replace_in_files "IS_CAPTAIN_INSTANCE" "IS_FLUKEDEPLOY_INSTANCE" "IS_INSTANCE env var"
replace_in_files "CAPTAIN_HOST_HTTP_PORT" "FLUKEDEPLOY_HOST_HTTP_PORT" "HOST_HTTP_PORT env var"
replace_in_files "CAPTAIN_HOST_HTTPS_PORT" "FLUKEDEPLOY_HOST_HTTPS_PORT" "HOST_HTTPS_PORT env var"
replace_in_files "CAPTAIN_HOST_ADMIN_PORT" "FLUKEDEPLOY_HOST_ADMIN_PORT" "HOST_ADMIN_PORT env var"
replace_in_files "CAPROVER_DISABLE_ANALYTICS" "FLUKEDEPLOY_DISABLE_ANALYTICS" "DISABLE_ANALYTICS env var"

echo ""
echo "📝 Phase 5: Service Naming Pattern"
replace_in_files "srv-captain--" "srv-flukedeploy--" "Service name prefix"

echo ""
echo "📝 Phase 6: File Renames"
if [ -f "src/api/CaptainError.ts" ]; then
    git mv src/api/CaptainError.ts src/api/FlukeDeployError.ts 2>/dev/null || mv src/api/CaptainError.ts src/api/FlukeDeployError.ts
    echo "  Renamed: CaptainError.ts → FlukeDeployError.ts"
fi

if [ -f "src/user/system/CaptainManager.ts" ]; then
    git mv src/user/system/CaptainManager.ts src/user/system/FlukeDeployManager.ts 2>/dev/null || mv src/user/system/CaptainManager.ts src/user/system/FlukeDeployManager.ts
    echo "  Renamed: CaptainManager.ts → FlukeDeployManager.ts"
fi

if [ -f "src/models/ICaptainDefinition.ts" ]; then
    git mv src/models/ICaptainDefinition.ts src/models/IFlukeDeployDefinition.ts 2>/dev/null || mv src/models/ICaptainDefinition.ts src/models/IFlukeDeployDefinition.ts
    echo "  Renamed: ICaptainDefinition.ts → IFlukeDeployDefinition.ts"
fi

echo ""
echo "📝 Phase 7: Frontend Files"
if [ -f "public/index.html" ]; then
    sed -i 's/<title>CapRover | Server Dashboard<\/title>/<title>FlukeDeploy | Server Dashboard<\/title>/g' public/index.html
    echo "  Updated: public/index.html title"
fi

if [ -f "public/manifest.json" ]; then
    sed -i 's/"short_name": "CapRover"/"short_name": "FlukeDeploy"/g' public/manifest.json
    sed -i 's/"name": "CapRover PaaS Control Panel"/"name": "FlukeDeploy AI-First PaaS"/g' public/manifest.json
    echo "  Updated: public/manifest.json"
fi

echo ""
echo "📝 Phase 8: Package Metadata"
if [ -f "package.json" ]; then
    sed -i 's/"name": "caprover"/"name": "flukedeploy"/g' package.json
    sed -i 's/Forked from CapRover/AI-First Deployment Platform/g' package.json
    echo "  Updated: package.json"
fi

echo ""
echo "✅ FlukeDeploy Rebranding Complete!"
echo ""
echo "📊 Summary of changes:"
echo "  - Class names: Captain* → FlukeDeploy*"
echo "  - Properties: captain* → flukedeploy*"
echo "  - Env vars: CAPTAIN_* → FLUKEDEPLOY_*"
echo "  - Services: srv-captain-- → srv-flukedeploy--"
echo "  - Files renamed: 3 core TypeScript files"
echo "  - Frontend: Title and manifest updated"
echo ""
echo "⚠️  Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Test compilation: npm run build"
echo "  3. Update import statements if needed"
echo "  4. Rebuild Docker image"
echo "  5. Update documentation"
echo ""
echo "💾 Backup created in: ../$BACKUP_DIR"
