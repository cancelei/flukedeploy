/**
 * Created by kasra on 27/06/17.
 */

import ApiStatusCodes from '../api/ApiStatusCodes'
import { IHashMapGeneric } from '../models/ICacheGeneric'
import FlukeDeployConstants from '../utils/FlukeDeployConstants'
import DataStore from './DataStore'

const dataStoreCache: IHashMapGeneric<DataStore> = {}

export default {
    getDataStore: function (namespace: string) {
        if (!namespace) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                'Empty namespace'
            )
        }

        if (namespace !== FlukeDeployConstants.rootNameSpace) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.STATUS_ERROR_GENERIC,
                'Namespace unknown'
            )
        }

        if (!dataStoreCache[namespace]) {
            dataStoreCache[namespace] = new DataStore(namespace)
        }

        return dataStoreCache[namespace]
    },
}
