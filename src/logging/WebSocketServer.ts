/**
 * WebSocket server for real-time deployment log streaming.
 *
 * Provides live streaming of deployment logs with client-side filtering.
 * Port 8767 (different from flukebase_connect's 8766).
 */

import WebSocket = require('ws')
import { IncomingMessage } from 'http'
import { globalDeploymentTracker } from './DeploymentTracker'
import { FlukeDeployEventType, LogLevel, UnifiedLogEntry } from './UnifiedSchema'

/**
 * Client subscription filter for log streaming.
 */
export interface LogStreamFilter {
    /** Filter by application name */
    app_name?: string
    /** Filter by deployment ID */
    deployment_id?: string
    /** Filter by log level */
    level?: LogLevel
    /** Filter by event type */
    event_type?: FlukeDeployEventType
}

/**
 * WebSocket client information.
 */
interface WebSocketClient {
    ws: WebSocket
    filter: LogStreamFilter
    subscribed_at: Date
}

/**
 * Log streaming server managing WebSocket connections.
 */
export class LogStreamingServer {
    private wss: WebSocket.Server
    private port: number
    private clients: Map<WebSocket, WebSocketClient> = new Map()
    private messageCount = 0
    private startedAt: Date

    constructor(port: number = 8767) {
        this.port = port
        this.startedAt = new Date()

        this.wss = new WebSocket.Server({ port: this.port })

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req)
        })

        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error)
        })

        console.log(`Log streaming server started on port ${this.port}`)
    }

    /**
     * Handle new WebSocket connection.
     *
     * @param ws WebSocket connection
     * @param req Incoming HTTP request
     */
    private handleConnection(ws: WebSocket, req: IncomingMessage): void {
        const clientInfo: WebSocketClient = {
            ws,
            filter: {},
            subscribed_at: new Date(),
        }

        this.clients.set(ws, clientInfo)

        // Parse URL query parameters as initial filter
        if (req.url) {
            const url = new URL(req.url, `http://localhost:${this.port}`)
            const params = url.searchParams

            if (params.has('app_name')) {
                clientInfo.filter.app_name = params.get('app_name')!
            }
            if (params.has('deployment_id')) {
                clientInfo.filter.deployment_id = params.get('deployment_id')!
            }
            if (params.has('level')) {
                clientInfo.filter.level = params.get('level') as LogLevel
            }
            if (params.has('event_type')) {
                clientInfo.filter.event_type = params.get(
                    'event_type'
                ) as FlukeDeployEventType
            }
        }

        console.log(
            `Client connected (${this.clients.size} total). Filter:`,
            clientInfo.filter
        )

        // Send welcome message
        ws.send(
            JSON.stringify({
                type: 'connected',
                message: 'Connected to FlukeDeploy log stream',
                port: this.port,
                filter: clientInfo.filter,
            })
        )

        // Handle incoming messages from client
        ws.on('message', (message: string) => {
            try {
                const data = JSON.parse(message)
                this.handleClientMessage(ws, data)
            } catch (error) {
                console.error('Error parsing client message:', error)
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        message: 'Invalid JSON message',
                    })
                )
            }
        })

        // Handle disconnection
        ws.on('close', () => {
            this.clients.delete(ws)
            console.log(`Client disconnected (${this.clients.size} total)`)
        })

        // Handle errors
        ws.on('error', (error) => {
            console.error('WebSocket client error:', error)
            this.clients.delete(ws)
        })
    }

    /**
     * Handle messages from client.
     *
     * @param ws WebSocket connection
     * @param data Parsed message data
     */
    private handleClientMessage(ws: WebSocket, data: any): void {
        const clientInfo = this.clients.get(ws)
        if (!clientInfo) return

        if (data.action === 'subscribe') {
            // Update subscription filter
            const filter: LogStreamFilter = data.filter || {}
            clientInfo.filter = filter

            ws.send(
                JSON.stringify({
                    type: 'subscribed',
                    message: 'Subscription updated',
                    filter,
                })
            )

            console.log('Client updated filter:', filter)
        } else if (data.action === 'ping') {
            // Keepalive ping
            ws.send(
                JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString(),
                })
            )
        } else if (data.action === 'get_stats') {
            // Send server stats
            ws.send(
                JSON.stringify({
                    type: 'stats',
                    stats: this.getStats(),
                })
            )
        } else {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: `Unknown action: ${data.action}`,
                })
            )
        }
    }

    /**
     * Broadcast a log entry to all subscribed clients.
     *
     * @param log Log entry to broadcast
     */
    broadcast(log: UnifiedLogEntry): void {
        this.messageCount++

        for (const [ws, clientInfo] of this.clients.entries()) {
            if (this.matchesFilter(log, clientInfo.filter)) {
                try {
                    ws.send(JSON.stringify(log))
                } catch (error) {
                    console.error('Error broadcasting to client:', error)
                    // Client likely disconnected, remove it
                    this.clients.delete(ws)
                }
            }
        }
    }

    /**
     * Check if a log entry matches a client's filter.
     *
     * @param log Log entry
     * @param filter Client filter
     * @returns True if log matches filter
     */
    private matchesFilter(
        log: UnifiedLogEntry,
        filter: LogStreamFilter
    ): boolean {
        if (
            filter.app_name &&
            log.flukedeploy_metadata.app_name !== filter.app_name
        ) {
            return false
        }

        if (
            filter.deployment_id &&
            log.flukedeploy_metadata.deployment_id !== filter.deployment_id
        ) {
            return false
        }

        if (filter.level && log.level !== filter.level) {
            return false
        }

        if (
            filter.event_type &&
            log.flukedeploy_metadata.event_type !== filter.event_type
        ) {
            return false
        }

        return true
    }

    /**
     * Get server statistics.
     *
     * @returns Stats object
     */
    getStats(): {
        total_clients: number
        port: number
        messages_broadcast: number
        uptime_ms: number
        started_at: string
    } {
        return {
            total_clients: this.clients.size,
            port: this.port,
            messages_broadcast: this.messageCount,
            uptime_ms: Date.now() - this.startedAt.getTime(),
            started_at: this.startedAt.toISOString(),
        }
    }

    /**
     * Get list of connected clients with their filters.
     *
     * @returns Array of client info
     */
    getClients(): Array<{
        filter: LogStreamFilter
        subscribed_at: string
    }> {
        return Array.from(this.clients.values()).map((client) => ({
            filter: client.filter,
            subscribed_at: client.subscribed_at.toISOString(),
        }))
    }

    /**
     * Close the WebSocket server.
     */
    close(): void {
        console.log('Closing log streaming server...')

        // Close all client connections
        for (const [ws] of this.clients.entries()) {
            ws.close()
        }
        this.clients.clear()

        // Close server
        this.wss.close(() => {
            console.log('Log streaming server closed')
        })
    }
}

/**
 * Global log streaming server instance (singleton).
 */
let globalStreamingServer: LogStreamingServer | null = null

/**
 * Get or create the global log streaming server.
 *
 * @param port WebSocket port (default: 8767)
 * @returns Log streaming server instance
 */
export function getLogStreamingServer(
    port: number = 8767
): LogStreamingServer {
    if (!globalStreamingServer) {
        globalStreamingServer = new LogStreamingServer(port)
    }
    return globalStreamingServer
}

/**
 * Broadcast a log entry to all connected clients.
 *
 * Convenience function that uses the global streaming server.
 *
 * @param log Log entry to broadcast
 */
export function broadcastLog(log: UnifiedLogEntry): void {
    const server = getLogStreamingServer()
    server.broadcast(log)
}
