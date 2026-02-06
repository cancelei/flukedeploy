import express = require('express')
import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import BaseApi from '../../../../api/BaseApi'
import {
    deployAppWithVariables,
    DeployAppWithVariablesParams,
} from '../../../../handlers/users/apps/deployment/DeploymentHandler'
import InjectionExtractor from '../../../../injection/InjectionExtractor'

const router = express.Router()

/**
 * POST /api/v3/user/apps/deployments/
 *
 * Deploy an application with environment variables and configuration
 *
 * Request Body:
 * {
 *   appName: string (required)
 *   image: string (required)
 *   envVars?: [{ key: string, value: string }]
 *   ports?: [{ containerPort: number, hostPort: number }]
 *   volumes?: [{ containerPath: string, volumeName?: string }]
 *   instanceCount?: number
 *   nodeId?: string
 *   notExposeAsWebApp?: boolean
 *   containerHttpPort?: number
 *   forceSsl?: boolean
 * }
 *
 * Response:
 * {
 *   statusCode: 100,
 *   description: "Deployment scheduled for app-name",
 *   data: {
 *     deployment_id: "dep-1234567890-abc123",
 *     status: "pending",
 *     app_name: "app-name",
 *     image: "myorg/image:v1.0",
 *     variables_updated: 3
 *   }
 * }
 */
router.post('/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    const params: DeployAppWithVariablesParams = {
        appName: req.body.appName,
        image: req.body.image,
        envVars: req.body.envVars,
        ports: req.body.ports,
        volumes: req.body.volumes,
        instanceCount: req.body.instanceCount,
        nodeId: req.body.nodeId,
        notExposeAsWebApp: req.body.notExposeAsWebApp,
        containerHttpPort: req.body.containerHttpPort,
        forceSsl: req.body.forceSsl,
    }

    // Validate required parameters
    if (!params.appName || !params.image) {
        return res.send(
            new BaseApi(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                'Missing required parameters: appName and image are required'
            )
        )
    }

    return deployAppWithVariables(params, serviceManager, dataStore)
        .then(function (result) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                result.message
            )
            baseApi.data = result.data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
