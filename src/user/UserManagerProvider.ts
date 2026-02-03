import ApiStatusCodes from '../api/ApiStatusCodes'
import { IHashMapGeneric } from '../models/ICacheGeneric'
import FlukeDeployConstants from '../utils/FlukeDeployConstants'
import { UserManager } from './UserManager'

const cache: IHashMapGeneric<UserManager> = {}
export class UserManagerProvider {
    static get(namespace: string) {
        namespace = `${namespace || ''}`.trim()
        if (!namespace) {
            throw new Error('NameSpace is empty')
        }

        if (namespace !== FlukeDeployConstants.rootNameSpace) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                'Namespace unknown'
            )
        }

        if (!cache[namespace]) {
            cache[namespace] = new UserManager(namespace)
        }

        return cache[namespace]
    }
}
