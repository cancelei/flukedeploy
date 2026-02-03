/**
 * Deployment lifecycle tracker for FlukeDeploy.
 *
 * Tracks deployments through 5 phases with timing, status, and error handling.
 * Maintains active and completed deployment history for monitoring and audit.
 */

import {
    createDeploymentLog,
    createErrorLog,
    FlukeDeployEventType,
    UnifiedLogEntry,
} from './UnifiedSchema'

/**
 * Deployment phase status.
 */
export type PhaseStatus = 'pending' | 'running' | 'success' | 'failed'

/**
 * Overall deployment status.
 */
export type DeploymentStatus =
    | 'pending'
    | 'building'
    | 'deploying'
    | 'success'
    | 'failed'
    | 'rolled_back'

/**
 * Deployment phase names.
 */
export type PhaseName =
    | 'pre_build'
    | 'build'
    | 'pre_deploy'
    | 'deploy'
    | 'post_deploy'

/**
 * Single deployment phase tracking.
 */
export interface DeploymentPhase {
    /** Phase name */
    phase: PhaseName
    /** Current status */
    status: PhaseStatus
    /** When phase started */
    started_at?: Date
    /** When phase completed */
    completed_at?: Date
    /** Phase duration in milliseconds */
    duration_ms?: number
    /** Log entries for this phase */
    logs: UnifiedLogEntry[]
    /** Error message if phase failed */
    error?: string
}

/**
 * Deployment session tracking full lifecycle.
 */
export class DeploymentSession {
    deployment_id: string
    app_name: string
    version?: string
    initiated_by: string // "api" | "webhook" | "cli" | "agent"
    initiated_at: Date
    strategy: string // "rolling" | "blue_green" | "canary"

    pre_build: DeploymentPhase
    build: DeploymentPhase
    pre_deploy: DeploymentPhase
    deploy: DeploymentPhase
    post_deploy: DeploymentPhase

    status: DeploymentStatus
    completed_at?: Date
    total_duration_ms?: number

    // Health and scaling
    replicas_requested: number
    replicas_ready: number
    health_status: 'healthy' | 'unhealthy' | 'starting'

    constructor(
        deploymentId: string,
        appName: string,
        initiatedBy: string,
        strategy: string = 'rolling',
        replicas: number = 1,
        version?: string
    ) {
        this.deployment_id = deploymentId
        this.app_name = appName
        this.version = version
        this.initiated_by = initiatedBy
        this.initiated_at = new Date()
        this.status = 'pending'
        this.strategy = strategy
        this.replicas_requested = replicas
        this.replicas_ready = 0
        this.health_status = 'starting'

        // Initialize phases
        this.pre_build = {
            phase: 'pre_build',
            status: 'pending',
            logs: [],
        }
        this.build = { phase: 'build', status: 'pending', logs: [] }
        this.pre_deploy = {
            phase: 'pre_deploy',
            status: 'pending',
            logs: [],
        }
        this.deploy = { phase: 'deploy', status: 'pending', logs: [] }
        this.post_deploy = {
            phase: 'post_deploy',
            status: 'pending',
            logs: [],
        }
    }

    /**
     * Start a deployment phase.
     *
     * @param phaseName Phase to start
     */
    startPhase(phaseName: PhaseName): void {
        const phase = this[phaseName]
        phase.status = 'running'
        phase.started_at = new Date()

        // Update session status
        if (phaseName === 'build') {
            this.status = 'building'
        } else if (phaseName === 'deploy' || phaseName === 'pre_deploy') {
            this.status = 'deploying'
        }

        // Create log entry
        const eventMap: Record<PhaseName, FlukeDeployEventType> = {
            pre_build: FlukeDeployEventType.PRE_BUILD,
            build: FlukeDeployEventType.BUILD_START,
            pre_deploy: FlukeDeployEventType.PRE_DEPLOY,
            deploy: FlukeDeployEventType.DEPLOY_START,
            post_deploy: FlukeDeployEventType.POST_DEPLOY,
        }

        const log = createDeploymentLog(
            `Phase ${phaseName} started`,
            eventMap[phaseName],
            this.app_name,
            'info',
            {
                deployment_id: this.deployment_id,
                version: this.version,
                strategy: this.strategy,
            }
        )

        phase.logs.push(log)
    }

    /**
     * Complete a deployment phase.
     *
     * @param phaseName Phase to complete
     * @param success Whether phase succeeded
     * @param error Error message if failed
     */
    completePhase(
        phaseName: PhaseName,
        success: boolean,
        error?: string
    ): void {
        const phase = this[phaseName]
        phase.status = success ? 'success' : 'failed'
        phase.completed_at = new Date()
        phase.error = error

        if (phase.started_at) {
            phase.duration_ms =
                phase.completed_at.getTime() - phase.started_at.getTime()
        }

        // Create log entry
        const eventType = success
            ? phaseName === 'build'
                ? FlukeDeployEventType.BUILD_COMPLETE
                : phaseName === 'deploy'
                  ? FlukeDeployEventType.DEPLOY_COMPLETE
                  : FlukeDeployEventType.POST_DEPLOY
            : phaseName === 'build'
              ? FlukeDeployEventType.BUILD_ERROR
              : FlukeDeployEventType.DEPLOY_ERROR

        const log = success
            ? createDeploymentLog(
                  `Phase ${phaseName} completed in ${phase.duration_ms}ms`,
                  eventType,
                  this.app_name,
                  'info',
                  {
                      deployment_id: this.deployment_id,
                      version: this.version,
                      duration_ms: phase.duration_ms,
                  }
              )
            : createErrorLog(
                  `Phase ${phaseName} failed: ${error}`,
                  eventType,
                  this.app_name,
                  new Error(error),
                  {
                      deployment_id: this.deployment_id,
                      version: this.version,
                  }
              )

        phase.logs.push(log)

        // Update overall status
        if (!success) {
            this.status = 'failed'
        } else if (phaseName === 'post_deploy') {
            this.status = 'success'
            this.completed_at = new Date()
            this.total_duration_ms =
                this.completed_at.getTime() - this.initiated_at.getTime()
        }
    }

    /**
     * Add a log entry to a specific phase.
     *
     * @param phaseName Phase to add log to
     * @param log Log entry
     */
    addLog(phaseName: PhaseName, log: UnifiedLogEntry): void {
        this[phaseName].logs.push(log)
    }

    /**
     * Get summary of deployment for API responses.
     *
     * @returns Deployment summary object
     */
    toSummary(): Record<string, any> {
        return {
            deployment_id: this.deployment_id,
            app_name: this.app_name,
            version: this.version,
            status: this.status,
            initiated_by: this.initiated_by,
            initiated_at: this.initiated_at.toISOString(),
            completed_at: this.completed_at?.toISOString(),
            total_duration_ms: this.total_duration_ms,
            strategy: this.strategy,
            replicas: {
                requested: this.replicas_requested,
                ready: this.replicas_ready,
            },
            health_status: this.health_status,
            phases: {
                pre_build: {
                    status: this.pre_build.status,
                    duration_ms: this.pre_build.duration_ms,
                },
                build: {
                    status: this.build.status,
                    duration_ms: this.build.duration_ms,
                },
                pre_deploy: {
                    status: this.pre_deploy.status,
                    duration_ms: this.pre_deploy.duration_ms,
                },
                deploy: {
                    status: this.deploy.status,
                    duration_ms: this.deploy.duration_ms,
                },
                post_deploy: {
                    status: this.post_deploy.status,
                    duration_ms: this.post_deploy.duration_ms,
                },
            },
        }
    }

    /**
     * Get all logs from all phases.
     *
     * @returns Array of all log entries
     */
    getAllLogs(): UnifiedLogEntry[] {
        return [
            ...this.pre_build.logs,
            ...this.build.logs,
            ...this.pre_deploy.logs,
            ...this.deploy.logs,
            ...this.post_deploy.logs,
        ]
    }
}

/**
 * Deployment lifecycle tracker managing multiple deployments.
 */
export class DeploymentLifecycleTracker {
    private activeDeployments: Map<string, DeploymentSession> = new Map()
    private completedDeployments: DeploymentSession[] = []
    private maxCompleted = 100

    /**
     * Start a new deployment session.
     *
     * @param deploymentId Unique deployment identifier
     * @param appName Application name
     * @param initiatedBy Who initiated (api, cli, agent, webhook)
     * @param strategy Deployment strategy
     * @param replicas Number of replicas
     * @param version Application version
     * @returns New deployment session
     */
    startDeployment(
        deploymentId: string,
        appName: string,
        initiatedBy: string,
        strategy: string = 'rolling',
        replicas: number = 1,
        version?: string
    ): DeploymentSession {
        const session = new DeploymentSession(
            deploymentId,
            appName,
            initiatedBy,
            strategy,
            replicas,
            version
        )
        this.activeDeployments.set(deploymentId, session)

        return session
    }

    /**
     * Get a deployment by ID.
     *
     * @param deploymentId Deployment identifier
     * @returns Deployment session or undefined
     */
    getDeployment(deploymentId: string): DeploymentSession | undefined {
        return (
            this.activeDeployments.get(deploymentId) ||
            this.completedDeployments.find(
                (d) => d.deployment_id === deploymentId
            )
        )
    }

    /**
     * Get all active deployments.
     *
     * @returns Array of active deployments
     */
    getActiveDeployments(): DeploymentSession[] {
        return Array.from(this.activeDeployments.values())
    }

    /**
     * Get deployments for a specific app.
     *
     * @param appName Application name
     * @param limit Maximum number to return
     * @returns Array of deployments
     */
    getAppDeployments(appName: string, limit: number = 10): DeploymentSession[] {
        const results: DeploymentSession[] = []

        // Check active first
        for (const session of this.activeDeployments.values()) {
            if (session.app_name === appName) {
                results.push(session)
            }
        }

        // Then completed (most recent first)
        for (
            let i = this.completedDeployments.length - 1;
            i >= 0 && results.length < limit;
            i--
        ) {
            if (this.completedDeployments[i].app_name === appName) {
                results.push(this.completedDeployments[i])
            }
        }

        return results.slice(0, limit)
    }

    /**
     * Mark a deployment as completed and move to history.
     *
     * @param deploymentId Deployment identifier
     */
    completeDeployment(deploymentId: string): void {
        const session = this.activeDeployments.get(deploymentId)
        if (session) {
            this.activeDeployments.delete(deploymentId)
            this.completedDeployments.push(session)

            // Maintain max history size
            if (this.completedDeployments.length > this.maxCompleted) {
                this.completedDeployments.shift()
            }
        }
    }

    /**
     * Get tracker statistics.
     *
     * @returns Stats object
     */
    getStats(): {
        active_count: number
        completed_count: number
        total_tracked: number
    } {
        return {
            active_count: this.activeDeployments.size,
            completed_count: this.completedDeployments.length,
            total_tracked:
                this.activeDeployments.size + this.completedDeployments.length,
        }
    }
}

/**
 * Global deployment tracker instance (singleton).
 */
export const globalDeploymentTracker = new DeploymentLifecycleTracker()
