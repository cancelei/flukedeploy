/**
 * REST API for deployment logs and lifecycle tracking.
 *
 * Provides endpoints for querying logs, deployment status, and history.
 * Integrates with DeploymentLifecycleTracker for real-time deployment monitoring.
 */

import express = require('express')
import { globalDeploymentTracker } from '../logging/DeploymentTracker'
import { FlukeDeployEventType, UnifiedLogEntry } from '../logging/UnifiedSchema'

/**
 * Create Express router for logs API.
 *
 * @returns Express router with log endpoints
 */
export function createLogsRouter(): express.Router {
    const router = express.Router()

    /**
     * GET /api/v1/logs - Query logs with filters
     *
     * Query parameters:
     * - app_name: Filter by application name
     * - deployment_id: Filter by deployment ID
     * - level: Filter by log level (debug, info, warn, error)
     * - event_type: Filter by event type (build_start, deploy_complete, etc.)
     * - since_minutes: Only return logs from last N minutes (default: 60)
     * - limit: Maximum number of logs to return (default: 1000)
     * - offset: Pagination offset (default: 0)
     */
    router.get('/logs', async (req, res) => {
        try {
            const {
                app_name,
                deployment_id,
                level,
                event_type,
                since_minutes = '60',
                limit = '1000',
                offset = '0',
            } = req.query

            const sinceMinutes = parseInt(since_minutes as string, 10)
            const limitNum = parseInt(limit as string, 10)
            const offsetNum = parseInt(offset as string, 10)

            // Get all relevant logs
            let logs: UnifiedLogEntry[] = []

            if (deployment_id) {
                // Specific deployment
                const deployment =
                    globalDeploymentTracker.getDeployment(
                        deployment_id as string
                    )
                if (deployment) {
                    logs = deployment.getAllLogs()
                }
            } else if (app_name) {
                // All deployments for app
                const deployments = globalDeploymentTracker.getAppDeployments(
                    app_name as string,
                    50
                )
                logs = deployments.flatMap((d) => d.getAllLogs())
            } else {
                // All active deployments
                const deployments =
                    globalDeploymentTracker.getActiveDeployments()
                logs = deployments.flatMap((d) => d.getAllLogs())
            }

            // Apply time filter
            const cutoffTime = new Date(
                Date.now() - sinceMinutes * 60 * 1000
            )
            logs = logs.filter(
                (log) => new Date(log.timestamp) >= cutoffTime
            )

            // Apply level filter
            if (level) {
                logs = logs.filter((log) => log.level === level)
            }

            // Apply event_type filter
            if (event_type) {
                logs = logs.filter(
                    (log) =>
                        log.flukedeploy_metadata.event_type === event_type
                )
            }

            // Sort by timestamp (newest first)
            logs.sort(
                (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime()
            )

            // Apply pagination
            const total = logs.length
            const paginatedLogs = logs.slice(
                offsetNum,
                offsetNum + limitNum
            )

            res.json({
                total,
                offset: offsetNum,
                limit: limitNum,
                logs: paginatedLogs,
            })
        } catch (error) {
            console.error('Error fetching logs:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    /**
     * GET /api/v1/deployments/:id/logs - Get logs for specific deployment
     *
     * Returns all logs for a deployment organized by phase.
     */
    router.get('/deployments/:id/logs', async (req, res) => {
        try {
            const { id } = req.params

            const deployment = globalDeploymentTracker.getDeployment(id)

            if (!deployment) {
                return res.status(404).json({
                    error: 'Deployment not found',
                    deployment_id: id,
                })
            }

            res.json({
                deployment: deployment.toSummary(),
                phases: {
                    pre_build: deployment.pre_build.logs,
                    build: deployment.build.logs,
                    pre_deploy: deployment.pre_deploy.logs,
                    deploy: deployment.deploy.logs,
                    post_deploy: deployment.post_deploy.logs,
                },
                total_logs: deployment.getAllLogs().length,
            })
        } catch (error) {
            console.error('Error fetching deployment logs:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    /**
     * GET /api/v1/apps/:name/deployments - Get recent deployments for app
     *
     * Query parameters:
     * - limit: Maximum number of deployments (default: 10)
     */
    router.get('/apps/:name/deployments', async (req, res) => {
        try {
            const { name } = req.params
            const { limit = '10' } = req.query

            const limitNum = parseInt(limit as string, 10)

            const deployments = globalDeploymentTracker.getAppDeployments(
                name,
                limitNum
            )

            res.json({
                app_name: name,
                total: deployments.length,
                deployments: deployments.map((d) => d.toSummary()),
            })
        } catch (error) {
            console.error('Error fetching app deployments:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    /**
     * GET /api/v1/deployments/active - Get all active deployments
     *
     * Returns summary of all currently running deployments.
     */
    router.get('/deployments/active', async (req, res) => {
        try {
            const deployments =
                globalDeploymentTracker.getActiveDeployments()

            res.json({
                total: deployments.length,
                deployments: deployments.map((d) => d.toSummary()),
            })
        } catch (error) {
            console.error('Error fetching active deployments:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    /**
     * GET /api/v1/deployments/:id - Get deployment status
     *
     * Returns detailed status of a specific deployment.
     */
    router.get('/deployments/:id', async (req, res) => {
        try {
            const { id } = req.params

            const deployment = globalDeploymentTracker.getDeployment(id)

            if (!deployment) {
                return res.status(404).json({
                    error: 'Deployment not found',
                    deployment_id: id,
                })
            }

            res.json(deployment.toSummary())
        } catch (error) {
            console.error('Error fetching deployment:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    /**
     * GET /api/v1/deployments/stats - Get deployment tracker statistics
     *
     * Returns overall statistics about tracked deployments.
     */
    router.get('/deployments/stats', async (req, res) => {
        try {
            const stats = globalDeploymentTracker.getStats()

            res.json({
                ...stats,
                timestamp: new Date().toISOString(),
            })
        } catch (error) {
            console.error('Error fetching stats:', error)
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
            })
        }
    })

    return router
}

/**
 * Register logs API with main Express app.
 *
 * @param app Express application
 *
 * @example
 * ```typescript
 * import express from 'express'
 * import { registerLogsAPI } from './api/LogsAPI'
 *
 * const app = express()
 * registerLogsAPI(app)
 * ```
 */
export function registerLogsAPI(app: express.Application): void {
    const router = createLogsRouter()
    app.use('/api/v1', router)

    console.log('Logs API registered at /api/v1')
    console.log('  GET /api/v1/logs')
    console.log('  GET /api/v1/deployments/:id')
    console.log('  GET /api/v1/deployments/:id/logs')
    console.log('  GET /api/v1/deployments/active')
    console.log('  GET /api/v1/deployments/stats')
    console.log('  GET /api/v1/apps/:name/deployments')
}
