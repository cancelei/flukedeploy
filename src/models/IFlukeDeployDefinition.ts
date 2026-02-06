export interface IFlukeDeployDefinition {
    schemaVersion: number
    dockerfileLines?: string[]
    dockerfilePath?: string
    imageName?: string
    templateId?: string
}
