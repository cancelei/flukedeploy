export interface FlukeDeployExtraTheme {
    siderTheme?: string
}

export default interface FlukeDeployTheme {
    content: string
    name: string
    extra?: string
    headEmbed?: string
    builtIn?: boolean
}
