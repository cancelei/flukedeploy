import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import ServiceManager from '../../../../user/ServiceManager'
import Logger from '../../../../utils/Logger'
import { BaseHandlerResult } from '../../../BaseHandlerResult'

export interface UploadCaptainDefinitionContentParams {
    appName: string
    isDetachedBuild: boolean
    flukedeployDefinitionContent?: string
    gitHash?: string
    uploadedTarPathSource?: string
}

export async function uploadCaptainDefinitionContent(
    params: UploadCaptainDefinitionContentParams,
    serviceManager: ServiceManager
): Promise<BaseHandlerResult> {
    const {
        appName,
        isDetachedBuild,
        flukedeployDefinitionContent,
        gitHash,
        uploadedTarPathSource,
    } = params

    const hasTar = !!uploadedTarPathSource
    const hasCaptainDef = !!flukedeployDefinitionContent

    if (hasTar === hasCaptainDef) {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_OPERATION,
            'Either uploadedTarPathSource or flukedeployDefinitionContent should be provided, but not both.'
        )
    }

    const promiseToDeployNewVer = serviceManager.scheduleDeployNewVersion(
        appName,
        {
            uploadedTarPathSource: hasTar
                ? {
                      uploadedTarPath: uploadedTarPathSource as string,
                      gitHash: `${gitHash || ''}`,
                  }
                : undefined,
            flukedeployDefinitionContentSource: hasCaptainDef
                ? {
                      flukedeployDefinitionContent:
                          flukedeployDefinitionContent as string,
                      gitHash: `${gitHash || ''}`,
                  }
                : undefined,
        }
    )

    if (isDetachedBuild) {
        // Avoid unhandled promise rejection
        promiseToDeployNewVer.catch(function (err: any) {
            Logger.e(err)
        })

        return {
            message: 'Deploy is started',
        }
    }

    await promiseToDeployNewVer

    return {
        message: 'Deploy is done',
    }
}
