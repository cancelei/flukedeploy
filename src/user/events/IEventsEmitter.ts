import { IFlukeDeployEvent } from './IFlukeDeployEvent'

export abstract class IEventsEmitter {
    abstract isEventApplicable(event: IFlukeDeployEvent): boolean
    abstract emitEvent(event: IFlukeDeployEvent): void
}
