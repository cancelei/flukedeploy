# FlukeDeploy Fork Guide

## Phase 1: Manual GitHub Fork Steps

### Prerequisites
- GitHub account with access to `flukebase` organization
- Git installed locally
- Node.js and npm installed

### Step 1: Fork Repositories on GitHub

You need to manually fork these three repositories:

1. **Main Backend**
   - Go to: https://github.com/caprover/caprover
   - Click "Fork" button
   - Select `flukebase` organization as destination
   - Rename to: `flukedeploy`

2. **Frontend**
   - Go to: https://github.com/caprover/caprover-frontend
   - Click "Fork" button
   - Select `flukebase` organization as destination
   - Rename to: `flukedeploy-frontend`

3. **CLI**
   - Go to: https://github.com/caprover/caprover-cli
   - Click "Fork" button
   - Select `flukebase` organization as destination
   - Rename to: `flukedeploy-cli`

### Step 2: Clone Repositories Locally

Once the forks are created, run:

```bash
cd ~/Projects

# Clone main backend
git clone https://github.com/flukebase/flukedeploy.git
cd flukedeploy
git remote add upstream https://github.com/caprover/caprover.git
npm install
npm test
npm run build
cd ..

# Clone frontend
git clone https://github.com/flukebase/flukedeploy-frontend.git
cd flukedeploy-frontend
git remote add upstream https://github.com/caprover/caprover-frontend.git
npm install
npm test
cd ..

# Clone CLI
git clone https://github.com/flukebase/flukedeploy-cli.git
cd flukedeploy-cli
git remote add upstream https://github.com/caprover/caprover-cli.git
npm install
npm test
cd ..
```

### Step 3: Verify Fork Integrity

After cloning, verify each repository:

```bash
# Backend
cd ~/Projects/flukedeploy
npm test
npm run build

# Frontend
cd ~/Projects/flukedeploy-frontend
npm test
npm run build

# CLI
cd ~/Projects/flukedeploy-cli
npm test
npm run build
```

All tests should pass and builds should complete without errors.

### Step 4: Ready for Rebranding

Once all three repositories are cloned and verified, you can proceed with:
- Task #2: Rebrand CapRover to FlukeDeploy
- Task #3-6: Implement logging system (can be done in parallel)
- Task #7-8: Create MCP tools (can be done in parallel)

## Notes

- Keep `upstream` remote to pull security patches and bug fixes from CapRover
- Always attribute CapRover in README files
- Document all architectural changes in ARCHITECTURE.md
- Use WeDo to track progress: `wedo_update_task(task_id="FLUKEDEPLOY-FORK-01", status="completed")`

## Next Steps After Fork

1. Run rebranding script (see Task #2)
2. Implement logging system (Tasks #3-6)
3. Create MCP tools (Tasks #7-8)
4. Build integration client (Task #9)
5. Test end-to-end (Task #10)
6. Document and store memories (Task #11)

---

**Status**: Waiting for manual GitHub forks
**Blocking**: Tasks #2-11 (can prepare some components in advance)
**Time to complete forks**: ~15 minutes
