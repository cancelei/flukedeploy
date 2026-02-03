export enum FlukeDeployEventType {
    UserLoggedIn = 'UserLoggedIn',
    AppBuildSuccessful = 'AppBuildSuccessful',
    AppBuildFailed = 'AppBuildFailed',
    InstanceStarted = 'InstanceStarted',
    OneClickAppDetailsFetched = 'OneClickAppDetailsFetched',
    OneClickAppListFetched = 'OneClickAppListFetched',
    OneClickAppDeployStarted = 'OneClickAppDeployStarted',
}

export interface IFlukeDeployEvent {
    eventType: FlukeDeployEventType
    eventMetadata: any
}

export class FlukeDeployEventFactory {
    static create(
        eventType: FlukeDeployEventType,
        eventMetadata: any
    ): IFlukeDeployEvent {
        return {
            eventType,
            eventMetadata,
        }
    }
}
