/**
 * Monitoring data models for FlukeDeploy dashboard
 */

export interface IAppMonitoringData {
    appName: string
    displayName: string
    status: 'running' | 'stopped' | 'restarting' | 'error' | 'starting'
    health: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
    replicas: {
        desired: number
        current: number
        ready: number
    }
    uptime: number // seconds
    lastDeployed: string // ISO timestamp
    domain: string
    hasHttps: boolean
    containerCount: number
    resourceUsage: {
        cpu: number // percentage
        memory: number // MB
        memoryLimit: number // MB
    }
    recentErrors: number
    healthCheckUrl?: string
}

export interface IContainerHealth {
    containerId: string
    containerName: string
    appName: string
    status: 'running' | 'exited' | 'restarting' | 'paused'
    state: string
    startedAt: string
    uptime: number // seconds
    restartCount: number
    cpu: {
        usage: number // percentage
        limit: number | null
    }
    memory: {
        usage: number // MB
        limit: number | null
        percentage: number
    }
    network: {
        rx: number // bytes received
        tx: number // bytes transmitted
    }
    logs: {
        hasErrors: boolean
        errorCount: number
        lastError?: string
    }
}

export interface ISystemMetrics {
    timestamp: string
    docker: {
        version: string
        containerCount: number
        runningContainers: number
        stoppedContainers: number
        imageCount: number
        volumeCount: number
    }
    system: {
        cpuCount: number
        totalMemory: number // MB
        usedMemory: number // MB
        availableMemory: number // MB
        memoryPercentage: number
        diskTotal: number // GB
        diskUsed: number // GB
        diskAvailable: number // GB
        diskPercentage: number
    }
    load: {
        avgLoad1min: number
        avgLoad5min: number
        avgLoad15min: number
    }
    uptime: number // seconds
}

export interface IOptimizationRecommendation {
    id: string
    severity: 'high' | 'medium' | 'low' | 'info'
    category: 'performance' | 'resource' | 'security' | 'cost' | 'isolation'
    appName?: string
    title: string
    description: string
    impact: string
    recommendation: string
    codeExample?: string
    estimatedImprovement?: string
    autoFixAvailable: boolean
    documentationUrl?: string
}

export interface IContainerResourceLimits {
    appName: string
    currentLimits: {
        memory?: string // e.g., "512M"
        cpus?: string // e.g., "0.5"
    }
    recommendedLimits: {
        memory: string
        cpus: string
        reasoning: string
    }
    currentUsage: {
        memory: {
            current: number
            peak: number
            average: number
        }
        cpu: {
            current: number
            peak: number
            average: number
        }
    }
}
