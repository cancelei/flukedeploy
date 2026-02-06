# FlukeDeploy Deployment API Guide

## Overview

FlukeDeploy now includes a new API endpoint that allows deploying applications with environment variables directly via API calls, without needing to manually configure them in the UI first.

**API Endpoint**: `POST /api/v3/user/apps/deployments/`

## Features

- Deploy applications with environment variables in a single API call
- Update app configuration (ports, volumes, instance count) during deployment
- Automatically updates app definition before deploying
- Returns deployment ID for tracking
- Supports full Docker Swarm service configuration

## API Request

### Endpoint
```
POST /api/v3/user/apps/deployments/
```

### Authentication
Requires FlukeDeploy session authentication (cookie-based).

### Request Body

```json
{
  "appName": "string (required)",
  "image": "string (required)",
  "envVars": [
    {
      "key": "string",
      "value": "string"
    }
  ],
  "ports": [
    {
      "containerPort": 80,
      "hostPort": 3000,
      "protocol": "tcp",
      "publishMode": "host"
    }
  ],
  "volumes": [
    {
      "containerPath": "/data",
      "volumeName": "app-data"
    }
  ],
  "instanceCount": 1,
  "nodeId": "",
  "notExposeAsWebApp": false,
  "containerHttpPort": 80,
  "forceSsl": false
}
```

### Response

```json
{
  "statusCode": 100,
  "description": "Deployment scheduled for app-name",
  "data": {
    "deployment_id": "dep-1738613200000-a7f2b3c4",
    "status": "pending",
    "app_name": "app-name",
    "image": "myorg/image:v1.0",
    "variables_updated": 3
  }
}
```

## Usage Example

### Using curl

```bash
# Get FlukeDeploy session cookie
COOKIE=$(curl -X POST http://194.163.44.171:3000/api/v3/login/ \
  -H "Content-Type: application/json" \
  -d '{"password": "your-admin-password"}' \
  -c /tmp/flukedeploy-cookie.txt -b /tmp/flukedeploy-cookie.txt \
  -s | jq -r '.data.token')

# Deploy application with environment variables
curl -X POST http://194.163.44.171:3000/api/v3/user/apps/deployments/ \
  -H "Content-Type: application/json" \
  -b /tmp/flukedeploy-cookie.txt \
  -d '{
    "appName": "my-app",
    "image": "my-app:latest",
    "envVars": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "DATABASE_URL", "value": "postgresql://user:pass@host:5432/db"},
      {"key": "API_KEY", "value": "secret"}
    ],
    "ports": [
      {"containerPort": 80, "hostPort": 3001, "publishMode": "host"}
    ],
    "instanceCount": 2,
    "containerHttpPort": 80,
    "forceSsl": false
  }'
```

### Using Node.js

```javascript
const axios = require('axios')

async function deployApp() {
  const baseUrl = 'http://194.163.44.171:3000/api/v3'

  // Login
  const loginResponse = await axios.post(`${baseUrl}/login/`, {
    password: 'your-admin-password'
  })

  const cookie = loginResponse.headers['set-cookie']

  // Deploy app
  const deployResponse = await axios.post(
    `${baseUrl}/user/apps/deployments/`,
    {
      appName: 'my-app',
      image: 'my-app:latest',
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'DATABASE_URL', value: 'postgresql://...' }
      ],
      ports: [{ containerPort: 80, hostPort: 3001, publishMode: 'host' }]
    },
    {
      headers: { Cookie: cookie }
    }
  )

  console.log('Deployment:', deployResponse.data)
}
```

### Using Python

```python
import requests

# Login
session = requests.Session()
login_response = session.post(
    'http://194.163.44.171:3000/api/v3/login/',
    json={'password': 'your-admin-password'}
)

# Deploy app
deploy_response = session.post(
    'http://194.163.44.171:3000/api/v3/user/apps/deployments/',
    json={
        'appName': 'my-app',
        'image': 'my-app:latest',
        'envVars': [
            {'key': 'NODE_ENV', 'value': 'production'},
            {'key': 'DATABASE_URL', 'value': 'postgresql://...'}
        ],
        'ports': [{'containerPort': 80, 'hostPort': 3001, 'publishMode': 'host'}]
    }
)

print('Deployment:', deploy_response.json())
```

## Deployment Workflow

1. **API receives request** with app name, image, and configuration
2. **Validates app exists** in FlukeDeploy
3. **Updates app definition** with new environment variables and configuration
4. **Schedules deployment** with new image
5. **Returns deployment ID** for tracking

## Prerequisites

- App must be registered in FlukeDeploy first
- Docker image must be available (on VPS or in a registry)
- Valid FlukeDeploy session authentication

## Error Handling

### Missing Required Parameters
```json
{
  "statusCode": 1000,
  "description": "Missing required parameters: appName and image are required"
}
```

### App Not Found
```json
{
  "statusCode": 1000,
  "description": "App my-app not found"
}
```

### Authentication Failed
```json
{
  "statusCode": 1101,
  "description": "The request is not authorized."
}
```

## Best Practices

1. **Security**:
   - Never log environment variable values in application logs
   - Use secrets management for sensitive data
   - Rotate credentials regularly

2. **Deployment**:
   - Use specific image tags (not `latest`) for reproducibility
   - Set resource limits (memory, CPU) to prevent OOM
   - Use health checks to verify deployment success

3. **Environment Variables**:
   - Use DATABASE_URL pattern for database connections
   - Prefix app-specific variables with app name
   - Document all required variables

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy to FlukeDeploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t my-app:${{ github.sha }} .

      - name: Transfer image to VPS
        run: |
          docker save my-app:${{ github.sha }} | \
          ssh -i ${{ secrets.VPS_SSH_KEY }} root@194.163.44.171 "docker load"

      - name: Deploy via API
        run: |
          curl -X POST http://194.163.44.171:3000/api/v3/user/apps/deployments/ \
            -H "Content-Type: application/json" \
            -H "Cookie: captain.token=${{ secrets.FLUKEDEPLOY_TOKEN }}" \
            -d '{
              "appName": "my-app",
              "image": "my-app:${{ github.sha }}",
              "envVars": [
                {"key": "NODE_ENV", "value": "production"},
                {"key": "DATABASE_URL", "value": "${{ secrets.DATABASE_URL }}"}
              ]
            }'
```

## Implementation Details

### Source Code Locations

- **Handler**: `/src/handlers/users/apps/deployment/DeploymentHandler.ts`
- **Router**: `/src/routes/user/apps/deployment/DeploymentRouter.ts`
- **API Registration**: `/src/routes/user/apps/AppsRouter.ts`

### How It Works

1. **Request validation** in router
2. **Extract user context** from authentication
3. **Fetch existing app definition** to preserve non-updated fields
4. **Merge new configuration** with existing settings
5. **Call service manager** to update app definition
6. **Schedule deployment** with new image
7. **Return deployment ID** for tracking

## Future Enhancements

- [ ] Bearer token authentication (API keys)
- [ ] Secrets encryption at rest
- [ ] Deployment rollback API
- [ ] Deployment status tracking API
- [ ] Blue-green deployment support
- [ ] Canary deployment support
- [ ] Automated health checks
- [ ] Webhook notifications for deployment events

## Support

For issues or questions:
- Check FlukeDeploy logs: `docker service logs flukedeploy-flukedeploy -f`
- Review app deployment logs: `docker service logs <app-name> -f`
- Verify app exists: `docker service ls | grep <app-name>`

---

**Last Updated**: 2026-02-04
**FlukeDeploy Version**: 0.0.0 (with deployment API)
