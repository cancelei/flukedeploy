import { RepoInfo } from './AppDefinition'

export interface IImageSource {
    uploadedTarPathSource?: { uploadedTarPath: string; gitHash: string }
    flukedeployDefinitionContentSource?: {
        flukedeployDefinitionContent: string
        gitHash: string
    }
    repoInfoSource?: RepoInfo
}
