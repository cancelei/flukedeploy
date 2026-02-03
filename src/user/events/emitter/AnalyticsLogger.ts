import EnvVars from '../../../utils/EnvVars'
import ProManager from '../../pro/ProManager'
import { FlukeDeployEventType, IFlukeDeployEvent } from '../IFlukeDeployEvent'
import { IEventsEmitter } from '../IEventsEmitter'

export class AnalyticsLogger extends IEventsEmitter {
    constructor(private proManager: ProManager) {
        super()
    }
    isEventApplicable(event: IFlukeDeployEvent): boolean {
        if (EnvVars.CAPROVER_DISABLE_ANALYTICS) {
            return false
        }

        // some events aren't appropriate for usage stats
        switch (event.eventType) {
            case FlukeDeployEventType.AppBuildFailed:
            case FlukeDeployEventType.AppBuildSuccessful:
            case FlukeDeployEventType.UserLoggedIn: // perhaps anonymize the IP address and send it in the future
                return false

            case FlukeDeployEventType.InstanceStarted:
            case FlukeDeployEventType.OneClickAppDetailsFetched:
            case FlukeDeployEventType.OneClickAppListFetched:
            case FlukeDeployEventType.OneClickAppDeployStarted:
                return true
        }
    }

    emitEvent(event: IFlukeDeployEvent): void {
        this.proManager.reportUnAuthAnalyticsEvent(event)
    }
}
