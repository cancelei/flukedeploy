/**
 * FlukeBase API integration client.
 *
 * Syncs deployment logs to flukebase.me API and updates WeDo tasks.
 * Provides real-time team notifications via WebSocket broadcast.
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { UnifiedLogEntry } from '../logging/UnifiedSchema'
import { DeploymentSession } from '../logging/DeploymentTracker'

/**
 * FlukeBase API client configuration.
 */
export interface FlukeBaseConfig {
    /** API base URL */
    apiUrl?: string
    /** API authentication token */
    apiToken?: string
    /** Enable log syncing */
    syncLogs?: boolean
    /** Enable WeDo task updates */
    syncTasks?: boolean
    /** Enable real-time broadcasts */
    broadcast?: boolean
}

/**
 * FlukeBase API response.
 */
export interface FlukeBaseResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

/**
 * WeDo task update payload.
 */
export interface WedoTaskUpdate {
    task_id: string
    status?: 'pending' | 'in_progress' | 'completed' | 'failed'
    synthesis_note?: string
    metadata?: Record<string, any>
}

/**
 * FlukeBase API client for deployment integration.
 */
export class FlukeBaseClient {
    private client: AxiosInstance
    private apiToken: string
    private baseUrl: string
    private config: FlukeBaseConfig
    private connected: boolean = false
    private syncEnabled: boolean = false

    constructor(config?: FlukeBaseConfig) {
        // Default configuration
        this.config = {
            apiUrl:
                config?.apiUrl ||
                process.env.FLUKEBASE_API_URL ||
                'https://flukebase.me/api/v1',
            apiToken:
                config?.apiToken || process.env.FLUKEBASE_API_TOKEN || '',
            syncLogs: config?.syncLogs !== false, // Default true
            syncTasks: config?.syncTasks !== false, // Default true
            broadcast: config?.broadcast !== false, // Default true
        }

        this.apiToken = this.config.apiToken!
        this.baseUrl = this.config.apiUrl!

        // Create axios instance
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json',
            },
        })

        // Add auth token if available
        if (this.apiToken) {
            this.client.defaults.headers.common['Authorization'] =
                `Bearer ${this.apiToken}`
            this.syncEnabled = true
        }

        // Request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                console.log(
                    `FlukeBase API: ${config.method?.toUpperCase()} ${config.url}`
                )
                return config
            },
            (error) => {
                console.error('FlukeBase API request error:', error)
                return Promise.reject(error)
            }
        )

        // Response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                console.error('FlukeBase API response error:', {
                    status: error.response?.status,
                    message: error.message,
                    url: error.config?.url,
                })
                return Promise.reject(error)
            }
        )
    }

    /**
     * Check if client is configured and ready.
     *
     * @returns True if client has API token
     */
    isConfigured(): boolean {
        return this.syncEnabled && !!this.apiToken
    }

    /**
     * Test connection to FlukeBase API.
     *
     * @returns Promise resolving to connection status
     */
    async testConnection(): Promise<boolean> {
        if (!this.isConfigured()) {
            console.warn(
                'FlukeBase client not configured (missing API token)'
            )
            return false
        }

        try {
            const response = await this.client.get('/health')
            this.connected = response.status === 200
            console.log(
                `FlukeBase connection: ${this.connected ? 'OK' : 'FAILED'}`
            )
            return this.connected
        } catch (error) {
            console.error('FlukeBase connection test failed:', error)
            this.connected = false
            return false
        }
    }

    /**
     * Sync a deployment log to FlukeBase.
     *
     * @param log Unified log entry
     * @param broadcast Whether to broadcast to team
     * @returns Promise resolving to API response
     */
    async syncDeploymentLog(
        log: UnifiedLogEntry,
        broadcast: boolean = true
    ): Promise<FlukeBaseResponse | null> {
        if (!this.isConfigured() || !this.config.syncLogs) {
            return null
        }

        try {
            const response = await this.client.post(
                '/flukebase_connect/deployment_logs',
                {
                    log,
                    broadcast: broadcast && this.config.broadcast,
                    source: 'flukedeploy',
                }
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            console.error('Failed to sync deployment log:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Sync multiple deployment logs in batch.
     *
     * @param logs Array of log entries
     * @param broadcast Whether to broadcast to team
     * @returns Promise resolving to API response
     */
    async syncDeploymentLogsBatch(
        logs: UnifiedLogEntry[],
        broadcast: boolean = true
    ): Promise<FlukeBaseResponse | null> {
        if (!this.isConfigured() || !this.config.syncLogs || logs.length === 0) {
            return null
        }

        try {
            const response = await this.client.post(
                '/flukebase_connect/deployment_logs/batch',
                {
                    logs,
                    broadcast: broadcast && this.config.broadcast,
                    source: 'flukedeploy',
                }
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            console.error('Failed to sync deployment logs batch:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Update a WeDo task.
     *
     * @param update Task update payload
     * @returns Promise resolving to API response
     */
    async updateWedoTask(
        update: WedoTaskUpdate
    ): Promise<FlukeBaseResponse | null> {
        if (!this.isConfigured() || !this.config.syncTasks) {
            return null
        }

        try {
            const response = await this.client.patch(
                `/flukebase_connect/wedo_tasks/${update.task_id}`,
                update
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            console.error('Failed to update WeDo task:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Create a WeDo task for a deployment.
     *
     * @param deployment Deployment session
     * @returns Promise resolving to API response
     */
    async createDeploymentTask(
        deployment: DeploymentSession
    ): Promise<FlukeBaseResponse | null> {
        if (!this.isConfigured() || !this.config.syncTasks) {
            return null
        }

        try {
            const response = await this.client.post(
                '/flukebase_connect/wedo_tasks',
                {
                    task_id: `DEPLOY-${deployment.deployment_id}`,
                    description: `Deploy ${deployment.app_name}${deployment.version ? ` ${deployment.version}` : ''}`,
                    dependency: 'AGENT_CAPABLE',
                    priority: 'normal',
                    tags: ['deployment', 'flukedeploy', deployment.app_name],
                    scope: 'flukebase-ecosystem',
                    metadata: {
                        deployment_id: deployment.deployment_id,
                        app_name: deployment.app_name,
                        version: deployment.version,
                        strategy: deployment.strategy,
                        initiated_by: deployment.initiated_by,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            console.error('Failed to create deployment task:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Sync deployment summary to FlukeBase.
     *
     * @param deployment Deployment session
     * @returns Promise resolving to API response
     */
    async syncDeploymentSummary(
        deployment: DeploymentSession
    ): Promise<FlukeBaseResponse | null> {
        if (!this.isConfigured()) {
            return null
        }

        try {
            const response = await this.client.post(
                '/flukebase_connect/deployments',
                {
                    deployment: deployment.toSummary(),
                    logs: deployment.getAllLogs(),
                    source: 'flukedeploy',
                }
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            console.error('Failed to sync deployment summary:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Get client configuration info.
     *
     * @returns Configuration summary
     */
    getConfig(): {
        configured: boolean
        connected: boolean
        baseUrl: string
        syncLogs: boolean
        syncTasks: boolean
        broadcast: boolean
    } {
        return {
            configured: this.isConfigured(),
            connected: this.connected,
            baseUrl: this.baseUrl,
            syncLogs: this.config.syncLogs || false,
            syncTasks: this.config.syncTasks || false,
            broadcast: this.config.broadcast || false,
        }
    }
}

/**
 * Global FlukeBase client instance (singleton).
 */
let globalFlukeBaseClient: FlukeBaseClient | null = null

/**
 * Get or create the global FlukeBase client.
 *
 * @param config Optional configuration
 * @returns FlukeBase client instance
 */
export function getFlukeBaseClient(
    config?: FlukeBaseConfig
): FlukeBaseClient {
    if (!globalFlukeBaseClient) {
        globalFlukeBaseClient = new FlukeBaseClient(config)
    }
    return globalFlukeBaseClient
}

/**
 * Sync a log entry to FlukeBase using the global client.
 *
 * Convenience function.
 *
 * @param log Log entry
 * @param broadcast Whether to broadcast
 * @returns Promise resolving to API response
 */
export async function syncLog(
    log: UnifiedLogEntry,
    broadcast: boolean = true
): Promise<FlukeBaseResponse | null> {
    const client = getFlukeBaseClient()
    return client.syncDeploymentLog(log, broadcast)
}
