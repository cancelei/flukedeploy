/**
 * Self-diagnostics and problem detection for FlukeDeploy.
 *
 * Provides comprehensive diagnostic checks across system, Docker, network,
 * storage, and security domains.
 */

import express = require('express')
import { execSync } from 'child_process'
import os = require('os')
import Logger from '../utils/Logger'

export interface DiagnosticReport {
    timestamp: string
    overall_status: 'pass' | 'warning' | 'fail'
    duration_ms: number
    checks: DiagnosticCheck[]
    recommendations: string[]
    summary: {
        total: number
        passed: number
        warnings: number
        failed: number
    }
}

export interface DiagnosticCheck {
    name: string
    category: 'system' | 'docker' | 'network' | 'storage' | 'security' | 'configuration'
    status: 'pass' | 'warning' | 'fail'
    message: string
    details?: any
    suggestion?: string
}

/**
 * Create Express router for diagnostics API.
 */
export function createDiagnosticsRouter(): express.Router {
    const router = express.Router()

    // POST /diagnose - Run full diagnostics
    router.post('/diagnose', async (req, res) => {
        try {
            const report = await runDiagnostics()
            const statusCode = report.overall_status === 'pass' ? 200 :
                              report.overall_status === 'warning' ? 200 : 503
            res.status(statusCode).json(report)
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to run diagnostics',
                message: error.message
            })
        }
    })

    // GET /diagnose/quick - Quick health checks
    router.get('/diagnose/quick', async (req, res) => {
        try {
            const checks = await runQuickChecks()
            const passed = checks.every(c => c.status === 'pass')
            res.json({
                status: passed ? 'pass' : 'fail',
                checks
            })
        } catch (error) {
            Logger.e(error)
            res.status(500).json({
                error: 'Failed to run quick checks',
                message: error.message
            })
        }
    })

    return router
}

/**
 * Run full diagnostic suite.
 */
async function runDiagnostics(): Promise<DiagnosticReport> {
    const startTime = Date.now()
    const checks: DiagnosticCheck[] = []

    // System checks
    checks.push(await checkDiskSpace())
    checks.push(await checkMemory())
    checks.push(await checkCPU())
    checks.push(await checkSystemLoad())

    // Docker checks
    checks.push(await checkDockerRunning())
    checks.push(await checkSwarmInitialized())
    checks.push(await checkServicesHealthy())
    checks.push(await checkContainerResources())

    // Network checks
    checks.push(await checkPortsAvailable())
    checks.push(await checkDNSResolution())
    checks.push(await checkNetworkConnectivity())

    // Storage checks
    checks.push(await checkVolumesMounted())
    checks.push(await checkLogRotation())

    // Configuration checks
    checks.push(await checkEnvironmentVariables())

    // Count results
    const passed = checks.filter(c => c.status === 'pass').length
    const warnings = checks.filter(c => c.status === 'warning').length
    const failed = checks.filter(c => c.status === 'fail').length

    // Determine overall status
    const overall = failed > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass'

    // Generate recommendations
    const recommendations = generateRecommendations(checks)

    const duration = Date.now() - startTime

    return {
        timestamp: new Date().toISOString(),
        overall_status: overall,
        duration_ms: duration,
        checks,
        recommendations,
        summary: {
            total: checks.length,
            passed,
            warnings,
            failed
        }
    }
}

/**
 * Run quick health checks (subset of full diagnostics).
 */
async function runQuickChecks(): Promise<DiagnosticCheck[]> {
    return [
        await checkDiskSpace(),
        await checkMemory(),
        await checkDockerRunning(),
        await checkSwarmInitialized()
    ]
}

// ==================== System Checks ====================

async function checkDiskSpace(): Promise<DiagnosticCheck> {
    try {
        const output = execSync('df -BG / | tail -1').toString().trim()
        const parts = output.split(/\s+/)
        const usageStr = parts[4].replace('%', '')
        const usage = parseInt(usageStr)

        if (usage > 90) {
            return {
                name: 'disk_space',
                category: 'system',
                status: 'fail',
                message: `Disk usage is critically high: ${usage}%`,
                details: { usage_percent: usage },
                suggestion: 'Run: docker image prune -a && docker system prune -f'
            }
        } else if (usage > 80) {
            return {
                name: 'disk_space',
                category: 'system',
                status: 'warning',
                message: `Disk usage is high: ${usage}%`,
                details: { usage_percent: usage },
                suggestion: 'Consider cleaning up old Docker images'
            }
        }

        return {
            name: 'disk_space',
            category: 'system',
            status: 'pass',
            message: `Disk usage is healthy: ${usage}%`,
            details: { usage_percent: usage }
        }
    } catch (error) {
        return {
            name: 'disk_space',
            category: 'system',
            status: 'fail',
            message: 'Failed to check disk space',
            details: { error: error.message }
        }
    }
}

async function checkMemory(): Promise<DiagnosticCheck> {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const usagePercent = Math.floor((usedMem / totalMem) * 100)

    if (usagePercent > 95) {
        return {
            name: 'memory',
            category: 'system',
            status: 'fail',
            message: `Memory usage is critically high: ${usagePercent}%`,
            details: {
                usage_percent: usagePercent,
                used_mb: Math.floor(usedMem / 1024 / 1024),
                total_mb: Math.floor(totalMem / 1024 / 1024)
            },
            suggestion: 'Restart high-memory services or upgrade VPS'
        }
    } else if (usagePercent > 85) {
        return {
            name: 'memory',
            category: 'system',
            status: 'warning',
            message: `Memory usage is high: ${usagePercent}%`,
            details: {
                usage_percent: usagePercent,
                used_mb: Math.floor(usedMem / 1024 / 1024),
                total_mb: Math.floor(totalMem / 1024 / 1024)
            },
            suggestion: 'Monitor memory usage and set resource limits'
        }
    }

    return {
        name: 'memory',
        category: 'system',
        status: 'pass',
        message: `Memory usage is healthy: ${usagePercent}%`,
        details: {
            usage_percent: usagePercent,
            used_mb: Math.floor(usedMem / 1024 / 1024),
            total_mb: Math.floor(totalMem / 1024 / 1024)
        }
    }
}

async function checkCPU(): Promise<DiagnosticCheck> {
    const cpus = os.cpus()
    const coreCount = cpus.length

    return {
        name: 'cpu',
        category: 'system',
        status: 'pass',
        message: `CPU available: ${coreCount} cores`,
        details: {
            cores: coreCount,
            model: cpus[0].model
        }
    }
}

async function checkSystemLoad(): Promise<DiagnosticCheck> {
    const loadAvg = os.loadavg()
    const coreCount = os.cpus().length
    const load15min = loadAvg[2]
    const loadPerCore = load15min / coreCount

    if (loadPerCore > 2.0) {
        return {
            name: 'system_load',
            category: 'system',
            status: 'warning',
            message: `System load is high: ${load15min.toFixed(2)} (${coreCount} cores)`,
            details: {
                load_1min: loadAvg[0].toFixed(2),
                load_5min: loadAvg[1].toFixed(2),
                load_15min: loadAvg[2].toFixed(2),
                cores: coreCount
            },
            suggestion: 'Check for resource-intensive processes'
        }
    }

    return {
        name: 'system_load',
        category: 'system',
        status: 'pass',
        message: `System load is normal: ${load15min.toFixed(2)} (${coreCount} cores)`,
        details: {
            load_1min: loadAvg[0].toFixed(2),
            load_5min: loadAvg[1].toFixed(2),
            load_15min: loadAvg[2].toFixed(2),
            cores: coreCount
        }
    }
}

// ==================== Docker Checks ====================

async function checkDockerRunning(): Promise<DiagnosticCheck> {
    try {
        execSync('docker info > /dev/null 2>&1')
        return {
            name: 'docker_running',
            category: 'docker',
            status: 'pass',
            message: 'Docker daemon is running'
        }
    } catch (error) {
        return {
            name: 'docker_running',
            category: 'docker',
            status: 'fail',
            message: 'Docker daemon is not running',
            suggestion: 'Start Docker: systemctl start docker'
        }
    }
}

async function checkSwarmInitialized(): Promise<DiagnosticCheck> {
    try {
        const output = execSync('docker node ls 2>&1').toString()
        if (output.includes('This node is not a swarm manager')) {
            return {
                name: 'docker_swarm',
                category: 'docker',
                status: 'fail',
                message: 'Docker Swarm is not initialized',
                suggestion: 'Initialize Swarm: docker swarm init'
            }
        }

        return {
            name: 'docker_swarm',
            category: 'docker',
            status: 'pass',
            message: 'Docker Swarm is initialized and healthy'
        }
    } catch (error) {
        return {
            name: 'docker_swarm',
            category: 'docker',
            status: 'fail',
            message: 'Failed to check Docker Swarm status',
            details: { error: error.message }
        }
    }
}

async function checkServicesHealthy(): Promise<DiagnosticCheck> {
    try {
        const output = execSync('docker service ls --format "{{.Name}}\t{{.Replicas}}" 2>/dev/null')
            .toString()
            .trim()

        if (!output) {
            return {
                name: 'services_health',
                category: 'docker',
                status: 'warning',
                message: 'No services running'
            }
        }

        const services = output.split('\n')
        const unhealthy = services.filter(line => {
            const replicas = line.split('\t')[1]
            const [current, total] = replicas.split('/')
            return current !== total
        })

        if (unhealthy.length > 0) {
            return {
                name: 'services_health',
                category: 'docker',
                status: 'warning',
                message: `${unhealthy.length} service(s) not at desired replica count`,
                details: { unhealthy_services: unhealthy.length, total_services: services.length },
                suggestion: 'Check service logs: docker service ps SERVICE_NAME'
            }
        }

        return {
            name: 'services_health',
            category: 'docker',
            status: 'pass',
            message: `All ${services.length} services are healthy`,
            details: { total_services: services.length }
        }
    } catch (error) {
        return {
            name: 'services_health',
            category: 'docker',
            status: 'fail',
            message: 'Failed to check service health',
            details: { error: error.message }
        }
    }
}

async function checkContainerResources(): Promise<DiagnosticCheck> {
    try {
        const output = execSync('docker stats --no-stream --format "{{.MemPerc}}" 2>/dev/null')
            .toString()
            .trim()

        if (!output) {
            return {
                name: 'container_resources',
                category: 'docker',
                status: 'pass',
                message: 'No containers to check'
            }
        }

        const memUsages = output.split('\n').map(line =>
            parseFloat(line.replace('%', ''))
        )

        const highMemContainers = memUsages.filter(usage => usage > 90).length

        if (highMemContainers > 0) {
            return {
                name: 'container_resources',
                category: 'docker',
                status: 'warning',
                message: `${highMemContainers} container(s) using >90% of memory limit`,
                suggestion: 'Check container logs and consider increasing memory limits'
            }
        }

        return {
            name: 'container_resources',
            category: 'docker',
            status: 'pass',
            message: 'Container resource usage is healthy'
        }
    } catch (error) {
        return {
            name: 'container_resources',
            category: 'docker',
            status: 'pass',
            message: 'Unable to check container resources (may not have limits set)'
        }
    }
}

// ==================== Network Checks ====================

async function checkPortsAvailable(): Promise<DiagnosticCheck> {
    const requiredPorts = [80, 443, 3000]
    const inUse: number[] = []

    for (const port of requiredPorts) {
        try {
            execSync(`ss -tuln | grep :${port} > /dev/null 2>&1`)
            inUse.push(port)
        } catch {
            // Port not in use (which could be bad if we expect it to be)
        }
    }

    if (inUse.length === 0) {
        return {
            name: 'ports',
            category: 'network',
            status: 'warning',
            message: 'No expected ports (80, 443, 3000) are listening',
            suggestion: 'Check if services are running'
        }
    }

    return {
        name: 'ports',
        category: 'network',
        status: 'pass',
        message: `Required ports are listening: ${inUse.join(', ')}`,
        details: { ports_listening: inUse }
    }
}

async function checkDNSResolution(): Promise<DiagnosticCheck> {
    try {
        execSync('nslookup google.com > /dev/null 2>&1', { timeout: 5000 })
        return {
            name: 'dns_resolution',
            category: 'network',
            status: 'pass',
            message: 'DNS resolution is working'
        }
    } catch (error) {
        return {
            name: 'dns_resolution',
            category: 'network',
            status: 'fail',
            message: 'DNS resolution failed',
            suggestion: 'Check /etc/resolv.conf and network connectivity'
        }
    }
}

async function checkNetworkConnectivity(): Promise<DiagnosticCheck> {
    try {
        execSync('ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1')
        return {
            name: 'network_connectivity',
            category: 'network',
            status: 'pass',
            message: 'Internet connectivity is working'
        }
    } catch (error) {
        return {
            name: 'network_connectivity',
            category: 'network',
            status: 'fail',
            message: 'No internet connectivity',
            suggestion: 'Check network configuration and firewall'
        }
    }
}

// ==================== Storage Checks ====================

async function checkVolumesMounted(): Promise<DiagnosticCheck> {
    try {
        const output = execSync('docker volume ls --format "{{.Name}}" 2>/dev/null')
            .toString()
            .trim()

        const volumeCount = output ? output.split('\n').length : 0

        return {
            name: 'volumes',
            category: 'storage',
            status: 'pass',
            message: `${volumeCount} Docker volume(s) available`,
            details: { volume_count: volumeCount }
        }
    } catch (error) {
        return {
            name: 'volumes',
            category: 'storage',
            status: 'fail',
            message: 'Failed to check Docker volumes',
            details: { error: error.message }
        }
    }
}

async function checkLogRotation(): Promise<DiagnosticCheck> {
    try {
        const config = execSync('cat /etc/docker/daemon.json 2>/dev/null').toString()

        if (config.includes('log-driver') && config.includes('max-size')) {
            return {
                name: 'log_rotation',
                category: 'storage',
                status: 'pass',
                message: 'Docker log rotation is configured'
            }
        }

        return {
            name: 'log_rotation',
            category: 'storage',
            status: 'warning',
            message: 'Docker log rotation is not configured',
            suggestion: 'Configure log rotation in /etc/docker/daemon.json'
        }
    } catch (error) {
        return {
            name: 'log_rotation',
            category: 'storage',
            status: 'warning',
            message: 'Unable to check log rotation configuration'
        }
    }
}

// ==================== Configuration Checks ====================

async function checkEnvironmentVariables(): Promise<DiagnosticCheck> {
    const required = ['CAPTAIN_ROOT_DOMAIN']
    const missing = required.filter(key => !process.env[key])

    if (missing.length > 0) {
        return {
            name: 'environment_variables',
            category: 'configuration',
            status: 'warning',
            message: `Missing environment variables: ${missing.join(', ')}`,
            suggestion: 'Set required environment variables'
        }
    }

    return {
        name: 'environment_variables',
        category: 'configuration',
        status: 'pass',
        message: 'All required environment variables are set'
    }
}

// ==================== Recommendations ====================

function generateRecommendations(checks: DiagnosticCheck[]): string[] {
    const recommendations: string[] = []

    // Extract all suggestions from failed/warning checks
    const issueChecks = checks.filter(c => c.status !== 'pass' && c.suggestion)
    for (const check of issueChecks) {
        if (check.suggestion && !recommendations.includes(check.suggestion)) {
            recommendations.push(check.suggestion)
        }
    }

    // Add general recommendations based on patterns
    const diskCheck = checks.find(c => c.name === 'disk_space')
    if (diskCheck && diskCheck.status !== 'pass') {
        recommendations.push('Schedule regular cleanup: docker system prune -af --volumes')
    }

    const memCheck = checks.find(c => c.name === 'memory')
    if (memCheck && memCheck.status !== 'pass') {
        recommendations.push('Set resource limits on services to prevent OOM issues')
    }

    return recommendations
}
