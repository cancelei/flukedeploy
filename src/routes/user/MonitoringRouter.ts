import express = require('express')
import ApiStatusCodes from '../../api/ApiStatusCodes'
import BaseApi from '../../api/BaseApi'
import InjectionExtractor from '../../injection/InjectionExtractor'
import FlukeDeployManager from '../../user/system/FlukeDeployManager'
import {
    getAllAppsHealth,
    getAppContainerHealth,
    getSystemMetrics,
    getOptimizationRecommendations
} from '../../handlers/users/MonitoringHandler'

const router = express.Router()

/**
 * GET /user/monitoring/apps
 * Returns health status for all deployed apps
 */
router.get('/apps', function (req, res, next) {
    const dataStore = InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return getAllAppsHealth(dataStore)
        .then(function (result) {
            const baseApi = new BaseApi(ApiStatusCodes.STATUS_OK, result.message)
            baseApi.data = result.data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

/**
 * GET /user/monitoring/apps/:appName/containers
 * Returns detailed container health for a specific app
 */
router.get('/apps/:appName/containers', function (req, res, next) {
    return getAppContainerHealth(req.params.appName)
        .then(function (result) {
            const baseApi = new BaseApi(ApiStatusCodes.STATUS_OK, result.message)
            baseApi.data = result.data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

/**
 * GET /user/monitoring/system
 * Returns system-wide resource metrics
 */
router.get('/system', function (req, res, next) {
    return getSystemMetrics()
        .then(function (result) {
            const baseApi = new BaseApi(ApiStatusCodes.STATUS_OK, result.message)
            baseApi.data = result.data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

/**
 * GET /user/monitoring/optimizations
 * Returns self-documented optimization recommendations
 */
router.get('/optimizations', function (req, res, next) {
    const dataStore = InjectionExtractor.extractUserFromInjected(res).user.dataStore

    return getOptimizationRecommendations(dataStore)
        .then(function (result) {
            const baseApi = new BaseApi(ApiStatusCodes.STATUS_OK, result.message)
            baseApi.data = result.data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

/**
 * POST /user/monitoring/apps/:appName/restart
 * Restarts a specific app
 */
router.post('/apps/:appName/restart', function (req, res, next) {
    const dockerApi = FlukeDeployManager.get().getDockerApi()
    const serviceName = `srv-flukedeploy--${req.params.appName}`

    return Promise.resolve()
        .then(function () {
            // Force update to restart the service
            return dockerApi.updateService(
                serviceName,
                undefined, // imageName
                undefined, // volumes
                undefined, // networks
                undefined, // arrayOfEnvKeyAndValue
                undefined, // secrets
                undefined, // authObject
                undefined, // instanceCount
                undefined, // nodeId
                undefined, // namespace
                undefined, // ports
                undefined, // appObject
                undefined, // updateOrder
                { forceUpdate: true }, // serviceUpdateOverride
                undefined  // preDeployFunction
            )
        })
        .then(function () {
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, 'App restarted successfully'))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
