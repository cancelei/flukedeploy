import ProManager from '../../pro/ProManager'
import { IFlukeDeployEvent } from '../IFlukeDeployEvent'
import { IEventsEmitter } from '../IEventsEmitter'

export class ProEmitter extends IEventsEmitter {
    constructor(private proManager: ProManager) {
        super()
    }
    isEventApplicable(event: IFlukeDeployEvent): boolean {
        return this.proManager.isEventEnabledForProReporting(event)
    }

    emitEvent(event: IFlukeDeployEvent): void {
        const self = this
        Promise.resolve()
            .then(function () {
                return self.proManager.getState()
            })
            .then(function (state) {
                if (state.isSubscribed) {
                    self.proManager.reportEvent(event)
                }
            })
    }
}
