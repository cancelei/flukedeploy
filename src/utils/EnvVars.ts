/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val: string | undefined, defaultPort: number): number {
    if (val === undefined) {
        return defaultPort
    }
    const port = parseInt(val, 10)

    if (isNaN(port)) {
        // named pipe
        return defaultPort
    }

    if (port >= 0) {
        // port number
        return port
    }

    return defaultPort
}

export default {
    keys: {
        FLUKEDEPLOY_DOCKER_API: 'FLUKEDEPLOY_DOCKER_API',
        FLUKEDEPLOY_IS_DEBUG: 'FLUKEDEPLOY_IS_DEBUG',
        DEFAULT_PASSWORD: 'DEFAULT_PASSWORD',
        IS_FLUKEDEPLOY_INSTANCE: 'IS_FLUKEDEPLOY_INSTANCE',
        DEMO_MODE_ADMIN_IP: 'DEMO_MODE_ADMIN_IP',
        FLUKEDEPLOY_BASE_DIRECTORY: 'FLUKEDEPLOY_BASE_DIRECTORY',
        FLUKEDEPLOY_HOST_HTTP_PORT: 'FLUKEDEPLOY_HOST_HTTP_PORT',
        FLUKEDEPLOY_HOST_HTTPS_PORT: 'FLUKEDEPLOY_HOST_HTTPS_PORT',
        FLUKEDEPLOY_HOST_ADMIN_PORT: 'FLUKEDEPLOY_HOST_ADMIN_PORT',
    },

    BY_PASS_PROXY_CHECK: process.env.BY_PASS_PROXY_CHECK,

    FLUKEDEPLOY_DOCKER_API: process.env.FLUKEDEPLOY_DOCKER_API,

    FLUKEDEPLOY_IS_DEBUG: !!process.env.FLUKEDEPLOY_IS_DEBUG,

    // Host ports - external to container.  Refer it via FlukeDeployConstants.configs.nginxPortNumber80
    FLUKEDEPLOY_HOST_HTTP_PORT: normalizePort(
        process.env.FLUKEDEPLOY_HOST_HTTP_PORT,
        80
    ), //Tested with 10080
    // Host ports - external to container.  Refer it via FlukeDeployConstants.configs.nginxPortNumber443
    FLUKEDEPLOY_HOST_HTTPS_PORT: normalizePort(
        process.env.FLUKEDEPLOY_HOST_HTTPS_PORT,
        443
    ), //Tested with 10443
    // Host ports - external to container.  Refer it via FlukeDeployConstants.configs.adminPortNumber3000
    FLUKEDEPLOY_HOST_ADMIN_PORT: normalizePort(
        process.env.FLUKEDEPLOY_HOST_ADMIN_PORT,
        3000
    ), //Tested with 13000

    MAIN_NODE_IP_ADDRESS: process.env.MAIN_NODE_IP_ADDRESS,

    ACCEPTED_TERMS: !!process.env.ACCEPTED_TERMS,

    IS_FLUKEDEPLOY_INSTANCE: process.env.IS_FLUKEDEPLOY_INSTANCE,

    DEMO_MODE_ADMIN_IP: process.env.DEMO_MODE_ADMIN_IP,

    DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD,

    FORCE_ENABLE_PRO: process.env.FORCE_ENABLE_PRO,

    FLUKEDEPLOY_DISABLE_ANALYTICS:
        !!process.env.FLUKEDEPLOY_DISABLE_ANALYTICS || !!process.env.DO_NOT_TRACK,

    FLUKEDEPLOY_BASE_DIRECTORY: process.env.FLUKEDEPLOY_BASE_DIRECTORY,
}
