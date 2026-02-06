/**
 * Health and status monitoring API for FlukeDeploy.
 *
 * Provides comprehensive health checks, metrics, and issue detection
 * optimized for AI agent consumption.
 */

import express = require('express')
import { execSync } from 'child_process'
import os = require('os')
import Logger from '../utils/Logger'

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    uptime_seconds: number
    timestamp: string
    version: string

    system: {
        cpu_usage_percent: number
        memory_used_percent: number
        memory_used_mb: number
        memory_total_mb: number
        disk_used_percent: number
        disk_used_gb: number
        disk_total_gb: number
        load_average: number[]
    }

    docker: {
        swarm_healthy: boolean
        manager_node: boolean
        services_count: number
        containers_running: number
        networks_count: number
    }

    flukedeploy: {
        apps_deployed: number
        root_domain: string | null
    }

    issues: HealthIssue[]
}

export interface ContainerMetrics {
    id: string
    name: string
    image: string
    status: string
    health_status: 'healthy' | 'unhealthy' | 'starting' | 'none'
    cpu_percent: number
    memory_usage_mb: number
    memory_limit_mb: number
    memory_percent: number
    network_rx_mb: number
    network_tx_mb: number
    block_read_mb: number
    block_write_mb: number
    pids: number
    uptime_seconds: number
}

export interface HealthIssue {
    severity: 'warning' | 'critical'
    component: string
    message: string
    timestamp: string
    suggested_action?: string
}

export interface SystemMetrics {
    cpu: {
        usage_percent: number
        cores: number
        load_average: number[]
    }
    memory: {
        total_mb: number
        used_mb: number
        free_mb: number
        usage_percent: number
    }
    disk: {
        total_gb: number
        used_gb: number
        free_gb: number
        usage_percent: number
    }
}

export interface DockerStatus {
    swarm: {
        initialized: boolean
        manager: boolean
        node_id: string | null
        node_hostname: string
    }
    services: {
        total: number
        running: number
        failed: number
        list: ServiceStatus[]
    }
    containers: {
        total: number
        running: number
        exited: number
    }
    networks: {
        total: number
        overlay: number
    }
}

export interface ServiceStatus {
    name: string
    replicas: string
    image: string
    status: 'running' | 'degraded' | 'failed'
}

// Metrics cache with TTL for optimization
interface MetricsCache {
    data: ContainerMetrics[]
    timestamp: number
    ttl: number // milliseconds
}

const containerMetricsCache: MetricsCache = {
    data: [],
    timestamp: 0,
    ttl: 30000 // 30 seconds cache
}

/**
 * Create Express router for health API endpoints.
 */
export function createHealthRouter(): express.Router {
    const router = express.Router()

    // GET /health - Overall health status
    router.get('/health', async (req, res) => {
        try {
            const health = await checkHealth()
            const statusCode = health.status === 'healthy' ? 200 :
                              health.status === 'degraded' ? 200 : 503
            res.status(statusCode).json(health)
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                status: 'unhealthy',
                error: 'Failed to check health',
                message: error.message
            })
        }
    })

    // GET /health/system - System metrics
    router.get('/health/system', async (req, res) => {
        try {
            const metrics: SystemMetrics = {
                cpu: getCPUMetrics(),
                memory: getMemoryMetrics(),
                disk: getDiskMetrics()
            }
            res.json(metrics)
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to get system metrics',
                message: error.message
            })
        }
    })

    // GET /health/docker - Docker status
    router.get('/health/docker', async (req, res) => {
        try {
            const status = await getDockerStatus()
            res.json(status)
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to get Docker status',
                message: error.message
            })
        }
    })

    // GET /health/issues - Current issues
    router.get('/health/issues', async (req, res) => {
        try {
            const issues = await detectIssues()
            res.json({
                total: issues.length,
                critical: issues.filter(i => i.severity === 'critical').length,
                warnings: issues.filter(i => i.severity === 'warning').length,
                issues
            })
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to detect issues',
                message: error.message
            })
        }
    })

    // GET /health/containers - Per-container metrics and health (cached)
    router.get('/health/containers', async (req, res) => {
        try {
            const detailed = req.query.detailed !== 'false' // Default true
            const forceRefresh = req.query.refresh === 'true' // Default false

            const metrics = await getContainerMetrics(detailed, forceRefresh)

            res.json({
                total: metrics.length,
                healthy: metrics.filter(m => m.health_status === 'healthy').length,
                unhealthy: metrics.filter(m => m.health_status === 'unhealthy').length,
                starting: metrics.filter(m => m.health_status === 'starting').length,
                containers: metrics,
                cached: !forceRefresh && (Date.now() - containerMetricsCache.timestamp < containerMetricsCache.ttl),
                cache_age_seconds: Math.floor((Date.now() - containerMetricsCache.timestamp) / 1000)
            })
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to get container metrics',
                message: error.message
            })
        }
    })

    return router
}

/**
 * Check overall system health.
 */
async function checkHealth(): Promise<HealthStatus> {
    const uptime = process.uptime()
    const issues = await detectIssues()

    // Determine overall status
    const hasCritical = issues.some(i => i.severity === 'critical')
    const hasWarnings = issues.some(i => i.severity === 'warning')
    const status = hasCritical ? 'unhealthy' :
                  hasWarnings ? 'degraded' : 'healthy'

    const systemMetrics = getCPUMetrics()
    const memoryMetrics = getMemoryMetrics()
    const diskMetrics = getDiskMetrics()
    const dockerStatus = await getDockerStatus()

    // Get app count from Docker services
    const appServices = dockerStatus.services.list.filter(s =>
        s.name.startsWith('srv-flukedeploy--') && !s.name.includes('-db')
    )

    return {
        status,
        uptime_seconds: Math.floor(uptime),
        timestamp: new Date().toISOString(),
        version: getVersion(),

        system: {
            cpu_usage_percent: systemMetrics.usage_percent,
            memory_used_percent: memoryMetrics.usage_percent,
            memory_used_mb: memoryMetrics.used_mb,
            memory_total_mb: memoryMetrics.total_mb,
            disk_used_percent: diskMetrics.usage_percent,
            disk_used_gb: diskMetrics.used_gb,
            disk_total_gb: diskMetrics.total_gb,
            load_average: systemMetrics.load_average
        },

        docker: {
            swarm_healthy: dockerStatus.swarm.initialized,
            manager_node: dockerStatus.swarm.manager,
            services_count: dockerStatus.services.total,
            containers_running: dockerStatus.containers.running,
            networks_count: dockerStatus.networks.total
        },

        flukedeploy: {
            apps_deployed: appServices.length,
            root_domain: process.env.CAPTAIN_ROOT_DOMAIN || null
        },

        issues
    }
}

/**
 * Detect system issues and generate alerts.
 */
async function detectIssues(): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = []

    try {
        // Check disk space
        const diskMetrics = getDiskMetrics()
        if (diskMetrics.usage_percent > 90) {
            issues.push({
                severity: 'critical',
                component: 'disk',
                message: `Disk usage is ${diskMetrics.usage_percent}% (${diskMetrics.used_gb}GB/${diskMetrics.total_gb}GB)`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Run docker image prune -a to clean up unused images'
            })
        } else if (diskMetrics.usage_percent > 80) {
            issues.push({
                severity: 'warning',
                component: 'disk',
                message: `Disk usage is ${diskMetrics.usage_percent}% (${diskMetrics.used_gb}GB/${diskMetrics.total_gb}GB)`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Consider cleaning up old Docker images and logs'
            })
        }

        // Check memory
        const memMetrics = getMemoryMetrics()
        if (memMetrics.usage_percent > 95) {
            issues.push({
                severity: 'critical',
                component: 'memory',
                message: `Memory usage is ${memMetrics.usage_percent}% (${memMetrics.used_mb}MB/${memMetrics.total_mb}MB)`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Restart high-memory services or upgrade VPS'
            })
        } else if (memMetrics.usage_percent > 85) {
            issues.push({
                severity: 'warning',
                component: 'memory',
                message: `Memory usage is ${memMetrics.usage_percent}% (${memMetrics.used_mb}MB/${memMetrics.total_mb}MB)`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Monitor memory usage and consider setting resource limits'
            })
        }

        // Check Docker Swarm
        const dockerStatus = await getDockerStatus()
        if (!dockerStatus.swarm.initialized) {
            issues.push({
                severity: 'critical',
                component: 'docker_swarm',
                message: 'Docker Swarm is not initialized',
                timestamp: new Date().toISOString(),
                suggested_action: 'Initialize Docker Swarm: docker swarm init'
            })
        }

        // Check for failed services
        const failedServices = dockerStatus.services.list.filter(s => s.status === 'failed')
        if (failedServices.length > 0) {
            issues.push({
                severity: 'critical',
                component: 'services',
                message: `${failedServices.length} service(s) have failed: ${failedServices.map(s => s.name).join(', ')}`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Check service logs with: docker service logs SERVICE_NAME'
            })
        }

        // Check for degraded services
        const degradedServices = dockerStatus.services.list.filter(s => s.status === 'degraded')
        if (degradedServices.length > 0) {
            issues.push({
                severity: 'warning',
                component: 'services',
                message: `${degradedServices.length} service(s) are degraded: ${degradedServices.map(s => s.name).join(', ')}`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Check service status with: docker service ps SERVICE_NAME'
            })
        }

        // Check CPU load
        const cpuMetrics = getCPUMetrics()
        const coreCount = cpuMetrics.cores
        const load15min = cpuMetrics.load_average[2]
        if (load15min > coreCount * 2) {
            issues.push({
                severity: 'warning',
                component: 'cpu',
                message: `High CPU load: ${load15min.toFixed(2)} (${coreCount} cores available)`,
                timestamp: new Date().toISOString(),
                suggested_action: 'Check for resource-intensive processes'
            })
        }
    } catch (error) {
        Logger.e('Error detecting issues:', error)
        issues.push({
            severity: 'warning',
            component: 'health_check',
            message: `Failed to complete health checks: ${error.message}`,
            timestamp: new Date().toISOString()
        })
    }

    return issues
}

/**
 * Get CPU metrics.
 */
function getCPUMetrics(): { usage_percent: number; cores: number; load_average: number[] } {
    const cpus = os.cpus()
    let totalIdle = 0
    let totalTick = 0

    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type as keyof typeof cpu.times]
        }
        totalIdle += cpu.times.idle
    }

    const usage = totalTick > 0 ? 100 - Math.floor(100 * totalIdle / totalTick) : 0

    return {
        usage_percent: usage,
        cores: cpus.length,
        load_average: os.loadavg()
    }
}

/**
 * Get memory metrics.
 */
function getMemoryMetrics(): {
    total_mb: number
    used_mb: number
    free_mb: number
    usage_percent: number
} {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    return {
        total_mb: Math.floor(totalMem / 1024 / 1024),
        used_mb: Math.floor(usedMem / 1024 / 1024),
        free_mb: Math.floor(freeMem / 1024 / 1024),
        usage_percent: Math.floor((usedMem / totalMem) * 100)
    }
}

/**
 * Get disk metrics.
 */
function getDiskMetrics(): {
    total_gb: number
    used_gb: number
    free_gb: number
    usage_percent: number
} {
    try {
        const output = execSync('df -BG / | tail -1').toString().trim()
        const parts = output.split(/\s+/)

        const totalStr = parts[1].replace('G', '')
        const usedStr = parts[2].replace('G', '')
        const freeStr = parts[3].replace('G', '')
        const usageStr = parts[4].replace('%', '')

        return {
            total_gb: parseInt(totalStr),
            used_gb: parseInt(usedStr),
            free_gb: parseInt(freeStr),
            usage_percent: parseInt(usageStr)
        }
    } catch (error) {
        Logger.e('Failed to get disk metrics:', error)
        return {
            total_gb: 0,
            used_gb: 0,
            free_gb: 0,
            usage_percent: 0
        }
    }
}

/**
 * Get Docker Swarm and service status.
 */
async function getDockerStatus(): Promise<DockerStatus> {
    try {
        // Check Swarm status
        let swarmInitialized = false
        let isManager = false
        let nodeId: string | null = null

        try {
            const nodeInfo = execSync('docker node ls --format "{{.ID}}\t{{.Hostname}}\t{{.ManagerStatus}}" 2>/dev/null')
                .toString()
                .trim()
            swarmInitialized = nodeInfo.length > 0

            if (swarmInitialized) {
                const lines = nodeInfo.split('\n')
                const currentNode = lines.find(line => line.includes('Leader') || line.includes('Reachable'))
                if (currentNode) {
                    const parts = currentNode.split('\t')
                    nodeId = parts[0]
                    isManager = parts[2] !== ''
                }
            }
        } catch (error) {
            // Swarm not initialized
            swarmInitialized = false
        }

        // Get services
        const services: ServiceStatus[] = []
        let totalServices = 0
        let runningServices = 0
        let failedServices = 0

        try {
            const servicesOutput = execSync('docker service ls --format "{{.Name}}\t{{.Replicas}}\t{{.Image}}" 2>/dev/null')
                .toString()
                .trim()

            if (servicesOutput) {
                const serviceLines = servicesOutput.split('\n')
                totalServices = serviceLines.length

                for (const line of serviceLines) {
                    const [name, replicas, image] = line.split('\t')
                    const [current, total] = replicas.split('/')

                    let status: 'running' | 'degraded' | 'failed' = 'running'
                    if (current === '0') {
                        status = 'failed'
                        failedServices++
                    } else if (current !== total) {
                        status = 'degraded'
                    } else {
                        runningServices++
                    }

                    services.push({
                        name,
                        replicas,
                        image,
                        status
                    })
                }
            }
        } catch (error) {
            // No services or error
        }

        // Get containers
        let totalContainers = 0
        let runningContainers = 0
        let exitedContainers = 0

        try {
            const containersOutput = execSync('docker ps -a --format "{{.Status}}" 2>/dev/null')
                .toString()
                .trim()

            if (containersOutput) {
                const statuses = containersOutput.split('\n')
                totalContainers = statuses.length
                runningContainers = statuses.filter(s => s.startsWith('Up')).length
                exitedContainers = statuses.filter(s => s.startsWith('Exited')).length
            }
        } catch (error) {
            // No containers
        }

        // Get networks
        let totalNetworks = 0
        let overlayNetworks = 0

        try {
            const networksOutput = execSync('docker network ls --format "{{.Driver}}" 2>/dev/null')
                .toString()
                .trim()

            if (networksOutput) {
                const drivers = networksOutput.split('\n')
                totalNetworks = drivers.length
                overlayNetworks = drivers.filter(d => d === 'overlay').length
            }
        } catch (error) {
            // No networks
        }

        return {
            swarm: {
                initialized: swarmInitialized,
                manager: isManager,
                node_id: nodeId,
                node_hostname: os.hostname()
            },
            services: {
                total: totalServices,
                running: runningServices,
                failed: failedServices,
                list: services
            },
            containers: {
                total: totalContainers,
                running: runningContainers,
                exited: exitedContainers
            },
            networks: {
                total: totalNetworks,
                overlay: overlayNetworks
            }
        }
    } catch (error) {
        Logger.e('Failed to get Docker status:', error)
        throw error
    }
}

/**
 * Get FlukeDeploy version.
 */
function getVersion(): string {
    try {
        const packageJson = require('../../package.json')
        return packageJson.version || 'unknown'
    } catch {
        return 'unknown'
    }
}

/**
 * Get per-container metrics with caching for optimization.
 *
 * OPTIMIZATION STRATEGIES:
 * 1. Cache results for 30 seconds (configurable TTL)
 * 2. Use `docker stats --no-stream` for single snapshot (fast)
 * 3. Batch all data collection in minimal docker calls
 * 4. Optional detailed mode to skip expensive metrics
 * 5. Limit to running containers only (no historical data)
 *
 * @param detailed - Include network/block I/O metrics (more expensive)
 * @param forceRefresh - Bypass cache and force fresh data collection
 */
async function getContainerMetrics(detailed: boolean = true, forceRefresh: boolean = false): Promise<ContainerMetrics[]> {
    // Check cache first (optimization #1)
    const now = Date.now()
    const cacheValid = (now - containerMetricsCache.timestamp) < containerMetricsCache.ttl

    if (!forceRefresh && cacheValid && containerMetricsCache.data.length > 0) {
        return containerMetricsCache.data
    }

    const metrics: ContainerMetrics[] = []

    try {
        // Get list of running containers with basic info (optimization #3: single call)
        const containersOutput = execSync(
            'docker ps --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}" --no-trunc 2>/dev/null'
        ).toString().trim()

        if (!containersOutput) {
            containerMetricsCache.data = []
            containerMetricsCache.timestamp = now
            return []
        }

        const containerLines = containersOutput.split('\n')

        // Collect container IDs for batch operations
        const containerIds = containerLines.map(line => line.split('\t')[0])

        // Get resource stats for all containers in one call (optimization #2: --no-stream)
        let statsMap: Map<string, any> = new Map()
        if (containerIds.length > 0) {
            try {
                const statsOutput = execSync(
                    `docker stats --no-stream --format "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}" ${containerIds.join(' ')} 2>/dev/null`
                ).toString().trim()

                if (statsOutput) {
                    for (const line of statsOutput.split('\n')) {
                        const [id, cpu, mem, memPerc, netIO, blockIO, pids] = line.split('\t')
                        statsMap.set(id, { cpu, mem, memPerc, netIO, blockIO, pids })
                    }
                }
            } catch (error) {
                Logger.e('Failed to get container stats:', error)
            }
        }

        // Get health status for all containers in one call (optimization #3)
        let healthMap: Map<string, string> = new Map()
        try {
            const healthOutput = execSync(
                `docker inspect --format="{{.Id}}\t{{.State.Health.Status}}" ${containerIds.join(' ')} 2>/dev/null`
            ).toString().trim()

            if (healthOutput) {
                for (const line of healthOutput.split('\n')) {
                    const [id, health] = line.split('\t')
                    healthMap.set(id, health || 'none')
                }
            }
        } catch (error) {
            // Containers may not have health checks defined
        }

        // Parse uptime for all containers
        let uptimeMap: Map<string, number> = new Map()
        try {
            const uptimeOutput = execSync(
                `docker inspect --format="{{.Id}}\t{{.State.StartedAt}}" ${containerIds.join(' ')} 2>/dev/null`
            ).toString().trim()

            if (uptimeOutput) {
                const nowTimestamp = Date.now()
                for (const line of uptimeOutput.split('\n')) {
                    const [id, startedAt] = line.split('\t')
                    if (startedAt && startedAt !== '<no value>') {
                        const startTime = new Date(startedAt).getTime()
                        const uptimeSeconds = Math.floor((nowTimestamp - startTime) / 1000)
                        uptimeMap.set(id, uptimeSeconds)
                    }
                }
            }
        } catch (error) {
            Logger.e('Failed to get container uptime:', error)
        }

        // Process each container
        for (const line of containerLines) {
            const [id, name, image, status] = line.split('\t')

            const stats = statsMap.get(id)
            const health = healthMap.get(id) || 'none'
            const uptime = uptimeMap.get(id) || 0

            // Parse CPU percentage
            let cpuPercent = 0
            if (stats && stats.cpu) {
                cpuPercent = parseFloat(stats.cpu.replace('%', '')) || 0
            }

            // Parse memory usage (format: "123.4MiB / 1.234GiB")
            let memoryUsageMb = 0
            let memoryLimitMb = 0
            let memoryPercent = 0
            if (stats && stats.mem) {
                const memParts = stats.mem.split(' / ')
                memoryUsageMb = parseMemoryValue(memParts[0])
                memoryLimitMb = parseMemoryValue(memParts[1])
                memoryPercent = parseFloat(stats.memPerc.replace('%', '')) || 0
            }

            // Parse network I/O (format: "1.23MB / 4.56MB") - only if detailed mode
            let networkRxMb = 0
            let networkTxMb = 0
            if (detailed && stats && stats.netIO) {
                const netParts = stats.netIO.split(' / ')
                networkRxMb = parseNetworkValue(netParts[0])
                networkTxMb = parseNetworkValue(netParts[1])
            }

            // Parse block I/O (format: "1.23MB / 4.56MB") - only if detailed mode
            let blockReadMb = 0
            let blockWriteMb = 0
            if (detailed && stats && stats.blockIO) {
                const blockParts = stats.blockIO.split(' / ')
                blockReadMb = parseNetworkValue(blockParts[0])
                blockWriteMb = parseNetworkValue(blockParts[1])
            }

            // Parse PIDs
            let pids = 0
            if (stats && stats.pids) {
                pids = parseInt(stats.pids) || 0
            }

            // Map health status to standard values
            let healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none'
            if (health === 'healthy') healthStatus = 'healthy'
            else if (health === 'unhealthy') healthStatus = 'unhealthy'
            else if (health === 'starting') healthStatus = 'starting'

            metrics.push({
                id: id.substring(0, 12), // Short ID
                name,
                image,
                status,
                health_status: healthStatus,
                cpu_percent: cpuPercent,
                memory_usage_mb: memoryUsageMb,
                memory_limit_mb: memoryLimitMb,
                memory_percent: memoryPercent,
                network_rx_mb: networkRxMb,
                network_tx_mb: networkTxMb,
                block_read_mb: blockReadMb,
                block_write_mb: blockWriteMb,
                pids,
                uptime_seconds: uptime
            })
        }

        // Update cache
        containerMetricsCache.data = metrics
        containerMetricsCache.timestamp = now

        return metrics

    } catch (error) {
        Logger.e('Failed to get container metrics:', error)
        return []
    }
}

/**
 * Parse memory value from Docker stats format (e.g., "123.4MiB" or "1.234GiB").
 */
function parseMemoryValue(value: string): number {
    if (!value) return 0

    const match = value.match(/^([\d.]+)(\w+)$/)
    if (!match) return 0

    const num = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    if (unit.includes('GIB') || unit.includes('GB')) {
        return num * 1024 // Convert to MB
    } else if (unit.includes('MIB') || unit.includes('MB')) {
        return num
    } else if (unit.includes('KIB') || unit.includes('KB')) {
        return num / 1024
    } else if (unit.includes('B')) {
        return num / (1024 * 1024)
    }

    return num
}

/**
 * Parse network/block I/O value from Docker stats format (e.g., "1.23MB" or "4.56GB").
 */
function parseNetworkValue(value: string): number {
    if (!value) return 0

    const match = value.match(/^([\d.]+)(\w+)$/)
    if (!match) return 0

    const num = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    if (unit.includes('GB')) {
        return num * 1024 // Convert to MB
    } else if (unit.includes('MB')) {
        return num
    } else if (unit.includes('KB')) {
        return num / 1024
    } else if (unit.includes('B')) {
        return num / (1024 * 1024)
    }

    return num
}
