import DataStore from '../../datastore/DataStore'
import FlukeDeployManager from '../../user/system/FlukeDeployManager'
import { BaseHandlerResult } from '../BaseHandlerResult'
import { IAppMonitoringData, IContainerHealth, ISystemMetrics, IOptimizationRecommendation } from '../../models/IMonitoringModels'

export interface MonitoringResult extends BaseHandlerResult {
    message: string
    data: any
}

/**
 * Get health status for all deployed apps
 */
export async function getAllAppsHealth(
    dataStore: DataStore
): Promise<MonitoringResult> {
    const apps = await dataStore.getAppsDataStore().getAppDefinitions()
    const dockerApi = FlukeDeployManager.get().getDockerApi()
    const appsHealth: IAppMonitoringData[] = []

    for (const appName of Object.keys(apps)) {
        const app = apps[appName]
        try {
            const serviceName = `srv-flukedeploy--${appName}`
            const serviceInfo = await dockerApi.inspectService(serviceName)
            const serviceTasks = await dockerApi.getServiceTasks(serviceName)

            // Get container stats
            const runningTask = serviceTasks.find((t: any) => t.Status.State === 'running')
            let resourceUsage = { cpu: 0, memory: 0, memoryLimit: 0 }

            if (runningTask?.Status?.ContainerStatus?.ContainerID) {
                const stats = await dockerApi.getContainerStats(
                    runningTask.Status.ContainerStatus.ContainerID
                )
                resourceUsage = parseContainerStats(stats)
            }

            // Calculate health
            const health = calculateAppHealth(serviceTasks, resourceUsage)

            // Get uptime from oldest running task
            const uptime = calculateUptime(serviceTasks)

            appsHealth.push({
                appName,
                displayName: appName.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                status: getAppStatus(serviceTasks),
                health,
                replicas: {
                    desired: serviceInfo.Spec.Mode.Replicated?.Replicas || 1,
                    current: serviceTasks.filter((t: any) => t.Status.State !== 'shutdown').length,
                    ready: serviceTasks.filter((t: any) => t.Status.State === 'running').length
                },
                uptime,
                lastDeployed: serviceInfo.UpdatedAt || serviceInfo.CreatedAt,
                domain: app.customDomain && app.customDomain[0]
                    ? app.customDomain[0].publicDomain
                    : `${appName}.${dataStore.getRootDomain()}`,
                hasHttps: !!app.hasDefaultSubDomainSsl,
                containerCount: serviceTasks.length,
                resourceUsage,
                recentErrors: 0,
                healthCheckUrl: app.customDomain && app.customDomain[0] ? app.customDomain[0].publicDomain : undefined
            })
        } catch (error) {
            console.error(`Error fetching health for ${appName}:`, error)
            appsHealth.push({
                appName,
                displayName: appName,
                status: 'error',
                health: 'unknown',
                replicas: { desired: 0, current: 0, ready: 0 },
                uptime: 0,
                lastDeployed: '',
                domain: '',
                hasHttps: false,
                containerCount: 0,
                resourceUsage: { cpu: 0, memory: 0, memoryLimit: 0 },
                recentErrors: 0
            })
        }
    }

    return {
        message: 'Apps health retrieved successfully',
        data: appsHealth
    }
}

/**
 * Get detailed container health for a specific app
 */
export async function getAppContainerHealth(
    appName: string
): Promise<MonitoringResult> {
    const dockerApi = FlukeDeployManager.get().getDockerApi()
    const serviceName = `srv-flukedeploy--${appName}`
    const tasks = await dockerApi.getServiceTasks(serviceName)
    const containerHealth: IContainerHealth[] = []

    for (const task of tasks) {
        if (!task.Status?.ContainerStatus?.ContainerID) continue

        const containerId = task.Status.ContainerStatus.ContainerID
        const containerInfo = await dockerApi.inspectContainerById(containerId)
        const stats = await dockerApi.getContainerStats(containerId)

        containerHealth.push({
            containerId: containerId.substring(0, 12),
            containerName: containerInfo.Name.substring(1),
            appName,
            status: containerInfo.State.Status as 'paused' | 'running' | 'restarting' | 'exited',
            state: task.Status.State,
            startedAt: containerInfo.State.StartedAt,
            uptime: Math.floor((Date.now() - new Date(containerInfo.State.StartedAt).getTime()) / 1000),
            restartCount: containerInfo.RestartCount || 0,
            cpu: {
                usage: calculateCpuPercent(stats),
                limit: getCpuLimit(containerInfo)
            },
            memory: {
                usage: Math.floor(stats.memory_stats.usage / (1024 * 1024)),
                limit: stats.memory_stats.limit ? Math.floor(stats.memory_stats.limit / (1024 * 1024)) : null,
                percentage: (stats.memory_stats.usage / stats.memory_stats.limit) * 100
            },
            network: {
                rx: stats.networks?.eth0?.rx_bytes || 0,
                tx: stats.networks?.eth0?.tx_bytes || 0
            },
            logs: {
                hasErrors: false,
                errorCount: 0
            }
        })
    }

    return {
        message: 'Container health retrieved successfully',
        data: containerHealth
    }
}

/**
 * Get system-wide metrics
 */
export async function getSystemMetrics(): Promise<MonitoringResult> {
    const dockerApi = FlukeDeployManager.get().getDockerApi()
    const dockerInfo = await dockerApi.getInfo()

    const metrics: ISystemMetrics = {
        timestamp: new Date().toISOString(),
        docker: {
            version: dockerInfo.ServerVersion,
            containerCount: dockerInfo.Containers,
            runningContainers: dockerInfo.ContainersRunning,
            stoppedContainers: dockerInfo.ContainersStopped,
            imageCount: dockerInfo.Images,
            volumeCount: 0
        },
        system: {
            cpuCount: dockerInfo.NCPU,
            totalMemory: Math.floor(dockerInfo.MemTotal / (1024 * 1024)),
            usedMemory: 0, // Will be calculated if needed
            availableMemory: Math.floor(dockerInfo.MemTotal / (1024 * 1024)),
            memoryPercentage: 0,
            diskTotal: 0, // Would need additional system calls
            diskUsed: 0,
            diskAvailable: 0,
            diskPercentage: 0
        },
        load: {
            avgLoad1min: 0,
            avgLoad5min: 0,
            avgLoad15min: 0
        },
        uptime: 0
    }

    return {
        message: 'System metrics retrieved successfully',
        data: metrics
    }
}

/**
 * Get self-documented optimization recommendations
 */
export async function getOptimizationRecommendations(
    dataStore: DataStore
): Promise<MonitoringResult> {
    const recommendations: IOptimizationRecommendation[] = []
    const apps = await dataStore.getAppsDataStore().getAppDefinitions()
    const dockerApi = FlukeDeployManager.get().getDockerApi()

    // Check for apps without resource limits
    for (const appName of Object.keys(apps)) {
        try {
            const serviceName = `srv-flukedeploy--${appName}`
            const serviceInfo = await dockerApi.inspectService(serviceName)

            const limits = serviceInfo.Spec.TaskTemplate.Resources?.Limits
            if (!limits?.MemoryBytes || !limits?.NanoCPUs) {
                recommendations.push({
                    id: `resource-limits-${appName}`,
                    severity: 'high',
                    category: 'performance',
                    appName,
                    title: 'No Resource Limits Set',
                    description: `Container for ${appName} has no memory or CPU limits. This can lead to resource starvation and affect other apps.`,
                    impact: 'Without limits, this app could consume all available resources, causing other apps to crash or become unresponsive.',
                    recommendation: 'Set appropriate resource limits based on the app\'s requirements.',
                    codeExample: `# Using Docker CLI
docker service update \\
  --limit-memory 512M \\
  --reserve-memory 256M \\
  --limit-cpu 0.5 \\
  srv-flukedeploy--${appName}`,
                    estimatedImprovement: 'Prevents OOM kills and improves overall system stability',
                    autoFixAvailable: true,
                    documentationUrl: 'https://docs.docker.com/config/containers/resource_constraints/'
                })
            }
        } catch (error) {
            console.error(`Error checking ${appName}:`, error)
        }
    }

    return {
        message: 'Optimization recommendations retrieved successfully',
        data: recommendations
    }
}

// Helper functions
function parseContainerStats(stats: any) {
    return {
        cpu: calculateCpuPercent(stats),
        memory: Math.floor(stats.memory_stats.usage / (1024 * 1024)),
        memoryLimit: stats.memory_stats.limit ? Math.floor(stats.memory_stats.limit / (1024 * 1024)) : 0
    }
}

function calculateCpuPercent(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats.cpu_usage?.total_usage || 0)
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats.system_cpu_usage || 0)
    const cpuCount = stats.cpu_stats.online_cpus || 1

    if (systemDelta === 0) return 0
    return (cpuDelta / systemDelta) * cpuCount * 100
}

function calculateAppHealth(tasks: any[], resourceUsage: any): 'healthy' | 'unhealthy' | 'degraded' | 'unknown' {
    const runningTasks = tasks.filter((t: any) => t.Status.State === 'running')

    if (runningTasks.length === 0) return 'unhealthy'
    if (resourceUsage.memoryLimit > 0 && resourceUsage.memory / resourceUsage.memoryLimit > 0.9) return 'degraded'
    if (resourceUsage.cpu > 90) return 'degraded'

    return 'healthy'
}

function getAppStatus(tasks: any[]): 'running' | 'stopped' | 'restarting' | 'error' | 'starting' {
    if (tasks.length === 0) return 'stopped'

    const states = tasks.map((t: any) => t.Status.State)
    if (states.some((s: string) => s === 'failed')) return 'error'
    if (states.some((s: string) => s === 'starting')) return 'starting'
    if (states.some((s: string) => s === 'running')) return 'running'

    return 'stopped'
}

function calculateUptime(tasks: any[]): number {
    const runningTasks = tasks.filter((t: any) => t.Status.State === 'running')
    if (runningTasks.length === 0) return 0

    const oldestTask = runningTasks.reduce((oldest: any, task: any) => {
        return new Date(task.Status.Timestamp) < new Date(oldest.Status.Timestamp) ? task : oldest
    })

    return Math.floor((Date.now() - new Date(oldestTask.Status.Timestamp).getTime()) / 1000)
}

function getCpuLimit(containerInfo: any): number | null {
    const nanoCPUs = containerInfo.HostConfig.NanoCPUs
    return nanoCPUs ? nanoCPUs / 1000000000 : null
}
