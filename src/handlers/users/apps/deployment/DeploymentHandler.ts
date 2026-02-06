import DataStore from '../../../../datastore/DataStore'
import { IAppEnvVar, IAppPort, IAppVolume } from '../../../../models/AppDefinition'
import ServiceManager from '../../../../user/ServiceManager'
import Logger from '../../../../utils/Logger'
import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import { BaseHandlerResult } from '../../../BaseHandlerResult'
import { v4 as uuidv4 } from 'uuid'

export interface DeployAppWithVariablesParams {
    appName: string
    image: string
    envVars?: IAppEnvVar[]
    ports?: IAppPort[]
    volumes?: IAppVolume[]
    instanceCount?: number
    nodeId?: string
    notExposeAsWebApp?: boolean
    containerHttpPort?: number
    forceSsl?: boolean
}

export interface DeploymentResult extends BaseHandlerResult {
    data: {
        deployment_id: string
        status: string
        app_name: string
        image: string
        variables_updated: number
    }
}

export async function deployAppWithVariables(
    params: DeployAppWithVariablesParams,
    serviceManager: ServiceManager,
    dataStore: DataStore
): Promise<DeploymentResult> {
    const {
        appName,
        image,
        envVars,
        ports,
        volumes,
        instanceCount,
        nodeId,
        notExposeAsWebApp,
        containerHttpPort,
        forceSsl,
    } = params

    Logger.d(`Deploying app with variables: ${appName}`)

    try {
        // 1. Validate app exists
        const app = await dataStore.getAppsDataStore().getAppDefinition(appName)

        if (!app) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                `App ${appName} not found`
            )
        }

        // 2. Build update object with all provided parameters
        const updateData: any = {}

        // Always update environment variables if provided
        if (envVars && envVars.length > 0) {
            updateData.envVars = envVars
        }

        // Update ports if provided
        if (ports && ports.length > 0) {
            updateData.ports = ports
        }

        // Update volumes if provided
        if (volumes && volumes.length > 0) {
            updateData.volumes = volumes
        }

        // Update instance count if provided
        if (instanceCount !== undefined) {
            updateData.instanceCount = instanceCount
        }

        // Update nodeId if provided
        if (nodeId) {
            updateData.nodeId = nodeId
        }

        // Update web app exposure settings
        if (notExposeAsWebApp !== undefined) {
            updateData.notExposeAsWebApp = notExposeAsWebApp
        }

        if (containerHttpPort !== undefined) {
            updateData.containerHttpPort = containerHttpPort
        }

        if (forceSsl !== undefined) {
            updateData.forceSsl = forceSsl
        }

        // 3. Update app definition with new configuration
        if (Object.keys(updateData).length > 0) {
            // Get current app to preserve existing values
            const currentApp = await dataStore.getAppsDataStore().getAppDefinition(appName)

            await serviceManager.updateAppDefinition(
                appName,
                currentApp.projectId || '', // projectId
                currentApp.description || '', // description
                updateData.instanceCount !== undefined ? updateData.instanceCount : currentApp.instanceCount, // instanceCount
                currentApp.flukedeployDefinitionRelativeFilePath || '', // flukedeployDefinitionRelativeFilePath
                updateData.envVars || currentApp.envVars || [], // envVars
                updateData.volumes || currentApp.volumes || [], // volumes
                currentApp.tags || [], // tags
                updateData.nodeId || currentApp.nodeId || '', // nodeId
                updateData.notExposeAsWebApp !== undefined ? updateData.notExposeAsWebApp : currentApp.notExposeAsWebApp, // notExposeAsWebApp
                updateData.containerHttpPort || currentApp.containerHttpPort || 80, // containerHttpPort
                currentApp.httpAuth || { user: '', password: '' }, // httpAuth
                updateData.forceSsl !== undefined ? updateData.forceSsl : currentApp.forceSsl, // forceSsl
                updateData.ports || currentApp.ports || [], // ports
                (currentApp.appPushWebhook?.repoInfo) || { repo: '', branch: '', user: '', password: '' }, // repoInfo
                currentApp.customNginxConfig || '', // customNginxConfig
                currentApp.redirectDomain || '', // redirectDomain
                currentApp.preDeployFunction || '', // preDeployFunction
                currentApp.serviceUpdateOverride || '', // serviceUpdateOverride
                currentApp.websocketSupport !== undefined ? currentApp.websocketSupport : false, // websocketSupport
                currentApp.appDeployTokenConfig || { enabled: false } // appDeployTokenConfig
            )

            Logger.d(`App definition updated for ${appName}`)
        }

        // 4. Schedule deployment with the new image
        const flukedeployDefinitionContent = {
            schemaVersion: 2,
            imageName: image,
        }

        await serviceManager.scheduleDeployNewVersion(appName, {
            flukedeployDefinitionContentSource: {
                flukedeployDefinitionContent: JSON.stringify(
                    flukedeployDefinitionContent
                ),
                gitHash: '',
            },
        })

        // 5. Generate deployment ID
        const deploymentId = `dep-${Date.now()}-${uuidv4().split('-')[0]}`

        Logger.d(`Deployment scheduled for ${appName} with ID: ${deploymentId}`)

        return {
            message: `Deployment scheduled for ${appName}`,
            data: {
                deployment_id: deploymentId,
                status: 'pending',
                app_name: appName,
                image: image,
                variables_updated: envVars ? envVars.length : 0,
            },
        }
    } catch (error: any) {
        Logger.e(`Deployment failed for ${appName}: ${error}`)
        throw error
    }
}
