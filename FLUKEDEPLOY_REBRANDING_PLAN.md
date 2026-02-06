# FlukeDeploy Comprehensive Rebranding Plan

## Vision
Position FlukeDeploy as an **AI-first deployment platform**, fully independent from CapRover, with modern branding and terminology.

## Rebranding Strategy

### Phase 1: Critical Source Code (IMMEDIATE)
- [ ] Class names: `CaptainError` → `FlukeDeployError`, `CaptainManager` → `FlukeDeployManager`
- [ ] Interface: `ICaptainDefinition` → `IFlukeDeployDefinition`
- [ ] Auth headers: `x-captain-auth` → `x-flukedeploy-auth` ✅ DONE
- [ ] Constants: All `captain*` → `flukedeploy*`
- [ ] Environment variables: `CAPTAIN_*` → `FLUKEDEPLOY_*`

### Phase 2: Service & Docker Infrastructure
- [ ] Service naming: `srv-captain--` → `srv-flukedeploy--`
- [ ] Network: `captain-overlay-network` → `flukedeploy-overlay-network`
- [ ] Docker images: Fork and rebrand caprover/* images
- [ ] Directory structure: `/captain/` → `/flukedeploy/`
- [ ] Subdomain: `captain.domain.com` → `deploy.domain.com` or `fd.domain.com`

### Phase 3: Configuration & Frontend
- [ ] package.json: Update description and metadata
- [ ] Web title: "CapRover" → "FlukeDeploy"
- [ ] Manifest: Update app name and branding
- [ ] File paths: `captain-definition` → `flukedeploy-definition`

### Phase 4: Documentation & GitHub
- [ ] README: Position as AI-first platform
- [ ] GitHub repo: Update description, topics, about
- [ ] CHANGELOG: Archive CapRover history, start fresh
- [ ] Issue templates: Update references
- [ ] CONTRIBUTING: Rebrand contribution guidelines

### Phase 5: Scripts & Development Tools
- [ ] Update all deployment scripts
- [ ] Postman collection: Rebrand API examples
- [ ] Development scripts: Update references

## New Positioning

**FlukeDeploy: AI-First Deployment Platform**

- **Smart Deployments**: AI-assisted configuration
- **Agent-Ready**: Built for autonomous deployment agents
- **CapRover Heritage**: Proven PaaS foundation, modernized for AI era
- **Flukebase Integration**: Native integration with Flukebase ecosystem

## Migration Path for Existing Users

1. Backward compatibility layer for CapRover → FlukeDeploy
2. Migration script: `migrate-from-caprover.sh` already exists
3. Documentation for smooth transition

## Implementation Order

1. ✅ Auth headers (x-flukedeploy-auth)
2. Core class/interface names
3. Environment variables
4. Service naming patterns
5. Docker images & networks
6. Frontend branding
7. Documentation
8. GitHub repository settings
