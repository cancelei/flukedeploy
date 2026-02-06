export class FlukeDeployError extends Error {
    public flukedeployErrorType: number
    public apiMessage: string

    constructor(code: number, msg: string) {
        super(msg)
        this.flukedeployErrorType = code
        this.apiMessage = msg
    }
}
