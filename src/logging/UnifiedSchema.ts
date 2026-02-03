/**
 * Unified logging schema for FlukeDeploy deployment events.
 *
 * Based on flukebase_connect's UnifiedLogEntry schema.
 * Provides JSON-LD format optimized for AI consumption with structured deployment metadata.
 *
 * Reference: flukebase_connect/logging/unified_schema.py
 */

/**
 * FlukeDeploy deployment event types tracking the full lifecycle.
 */
export enum FlukeDeployEventType {
    /** Pre-build hooks executing */
    PRE_BUILD = 'pre_build',
    /** Docker build started */
    BUILD_START = 'build_start',
    /** Build completed successfully */
    BUILD_COMPLETE = 'build_complete',
    /** Build failed with error */
    BUILD_ERROR = 'build_error',
    /** Pre-deploy validation running */
    PRE_DEPLOY = 'pre_deploy',
    /** Deployment to swarm started */
    DEPLOY_START = 'deploy_start',
    /** Deployment completed successfully */
    DEPLOY_COMPLETE = 'deploy_complete',
    /** Deployment failed with error */
    DEPLOY_ERROR = 'deploy_error',
    /** Post-deploy hooks executing */
    POST_DEPLOY = 'post_deploy',
    /** Health check results */
    HEALTH_CHECK = 'health_check',
    /** Replicas scaled up or down */
    SCALE_EVENT = 'scale_event',
    /** Configuration updated */
    CONFIG_CHANGE = 'config_change',
}

/**
 * Health status for deployments and services.
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'starting'

/**
 * FlukeDeploy-specific metadata attached to each log entry.
 */
export interface FlukeDeployMetadata {
    /** Event type from deployment lifecycle */
    event_type: FlukeDeployEventType
    /** Application name being deployed */
    app_name: string
    /** Unique deployment identifier */
    deployment_id?: string
    /** Application version (e.g., "v1.2.3", git SHA) */
    version?: string
    /** Docker build identifier */
    build_id?: string
    /** Duration of the operation in milliseconds */
    duration_ms?: number
    /** Number of replicas */
    replicas?: number
    /** Health check status */
    health_status?: HealthStatus
    /** Error code if operation failed */
    error_code?: string
    /** Stack trace for errors */
    stack_trace?: string
    /** Deployment strategy used (rolling, blue_green, canary) */
    strategy?: string
    /** Environment deployed to (dev, staging, production) */
    environment?: string
}

/**
 * Log source information.
 */
export interface LogSource {
    /** Source type (deployment, container, system) */
    type: 'deployment' | 'container' | 'system'
    /** Container name or system component */
    container_name: string
    /** Docker service ID (optional) */
    service_id?: string
    /** Docker node ID (optional) */
    node_id?: string
}

/**
 * Log level enumeration.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Unified log entry in JSON-LD format.
 *
 * This structure is optimized for AI consumption and follows
 * the Linked Data specification for semantic interoperability.
 */
export interface UnifiedLogEntry {
    /** JSON-LD context URL */
    '@context': 'https://flukebase.me/schemas/unified-log'
    /** JSON-LD type */
    '@type': 'UnifiedLogEntry'
    /** Unique log entry identifier */
    id: string
    /** ISO 8601 timestamp */
    timestamp: string
    /** Log severity level */
    level: LogLevel
    /** Human-readable log message */
    message: string
    /** Source of the log entry */
    source: LogSource
    /** FlukeDeploy-specific metadata */
    flukedeploy_metadata: FlukeDeployMetadata
    /** Additional tags for filtering/search */
    tags?: string[]
}

/**
 * Create a deployment log entry with proper structure.
 *
 * @param message Human-readable message
 * @param eventType Deployment lifecycle event
 * @param appName Application name
 * @param level Log severity level
 * @param metadata Additional metadata
 * @returns Structured log entry
 *
 * @example
 * ```typescript
 * const log = createDeploymentLog(
 *     "Build started for api-server",
 *     FlukeDeployEventType.BUILD_START,
 *     "api-server",
 *     "info",
 *     { deployment_id: "dep-123", version: "v1.2.3" }
 * )
 * ```
 */
export function createDeploymentLog(
    message: string,
    eventType: FlukeDeployEventType,
    appName: string,
    level: LogLevel = 'info',
    metadata?: Partial<FlukeDeployMetadata>
): UnifiedLogEntry {
    const timestamp = new Date().toISOString()
    const id = `dep-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    return {
        '@context': 'https://flukebase.me/schemas/unified-log',
        '@type': 'UnifiedLogEntry',
        id,
        timestamp,
        level,
        message,
        source: {
            type: 'deployment',
            container_name: appName,
        },
        flukedeploy_metadata: {
            event_type: eventType,
            app_name: appName,
            ...metadata,
        },
    }
}

/**
 * Create an error log entry with stack trace.
 *
 * @param message Error message
 * @param eventType Error event type
 * @param appName Application name
 * @param error Error object
 * @param metadata Additional metadata
 * @returns Error log entry
 */
export function createErrorLog(
    message: string,
    eventType: FlukeDeployEventType,
    appName: string,
    error: Error,
    metadata?: Partial<FlukeDeployMetadata>
): UnifiedLogEntry {
    return createDeploymentLog(message, eventType, appName, 'error', {
        ...metadata,
        error_code: error.name,
        stack_trace: error.stack,
    })
}

/**
 * Create a health check log entry.
 *
 * @param appName Application name
 * @param status Health status
 * @param metadata Additional metadata
 * @returns Health check log entry
 */
export function createHealthCheckLog(
    appName: string,
    status: HealthStatus,
    metadata?: Partial<FlukeDeployMetadata>
): UnifiedLogEntry {
    const message = `Health check: ${status}`

    return createDeploymentLog(
        message,
        FlukeDeployEventType.HEALTH_CHECK,
        appName,
        status === 'healthy' ? 'info' : 'warn',
        {
            ...metadata,
            health_status: status,
        }
    )
}

/**
 * Create a scale event log entry.
 *
 * @param appName Application name
 * @param oldReplicas Previous replica count
 * @param newReplicas New replica count
 * @param metadata Additional metadata
 * @returns Scale event log entry
 */
export function createScaleLog(
    appName: string,
    oldReplicas: number,
    newReplicas: number,
    metadata?: Partial<FlukeDeployMetadata>
): UnifiedLogEntry {
    const message = `Scaled from ${oldReplicas} to ${newReplicas} replicas`

    return createDeploymentLog(
        message,
        FlukeDeployEventType.SCALE_EVENT,
        appName,
        'info',
        {
            ...metadata,
            replicas: newReplicas,
        }
    )
}
