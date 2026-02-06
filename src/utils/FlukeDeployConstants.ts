import fs = require('fs-extra')
import path = require('path')
import EnvVars from './EnvVars'

const FLUKEDEPLOY_BASE_DIRECTORY = EnvVars.FLUKEDEPLOY_BASE_DIRECTORY || '/captain'
const FLUKEDEPLOY_DATA_DIRECTORY = FLUKEDEPLOY_BASE_DIRECTORY + '/data' // data that sits here can be backed up
const FLUKEDEPLOY_ROOT_DIRECTORY_TEMP = FLUKEDEPLOY_BASE_DIRECTORY + '/temp'
const FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED = FLUKEDEPLOY_BASE_DIRECTORY + '/generated'

const CONSTANT_FILE_OVERRIDE_BUILD = path.join(
    __dirname,
    '../../config-override.json'
)
const CONSTANT_FILE_OVERRIDE_USER =
    FLUKEDEPLOY_DATA_DIRECTORY + '/config-override.json'

const configs = {
    publishedNameOnDockerHub: 'flukedeploy/flukedeploy',

    version: '1.14.1',

    defaultMaxLogSize: '512m',

    defaultDockerBuildVersion: '2' as '1' | '2',

    buildLogSize: 50,

    appLogSize: 500,

    maxVersionHistory: 50,

    skipVerifyingDomains: false,

    enableDockerLogsTimestamp: true,

    registrySubDomainPort: 996,

    dockerApiVersion: 'v1.44',

    netDataImageName: 'caprover/netdata:v1.34.1',

    goAccessImageName: 'caprover/goaccess:1.9.4',

    goAccessAnonymizeIP: false,

    registryImageName: 'registry:2',

    appPlaceholderImageName: 'caprover/caprover-placeholder-app:latest',

    nginxImageName: 'nginx:1.27.2',

    defaultEmail: 'runner@flukedeploy.com',

    flukedeploySubDomain: 'captain',

    overlayNetworkOverride: {},

    useExistingSwarm: true,

    proApiDomains: ['https://pro.flukedeploy.com'],

    analyticsDomain: 'https://analytics-v1.flukedeploy.com',

    certbotImageName: 'caprover/certbot-sleeping:v2.11.0',

    certbotCertCommandRules: undefined as CertbotCertCommandRule[] | undefined,

    // this is added in 1.13 just as a safety - remove this after 1.14
    disableEncryptedCheck: false,

    // The port can be overridden via env variable FLUKEDEPLOY_HOST_HTTP_PORT
    nginxPortNumber80: EnvVars.FLUKEDEPLOY_HOST_HTTP_PORT,
    // The port can be overridden via env variable FLUKEDEPLOY_HOST_HTTPS_PORT
    nginxPortNumber443: EnvVars.FLUKEDEPLOY_HOST_HTTPS_PORT,
    // The port can be overridden via env variable FLUKEDEPLOY_HOST_ADMIN_PORT
    adminPortNumber3000: EnvVars.FLUKEDEPLOY_HOST_ADMIN_PORT,

    defaultGzipOn: true,

    defaultGzipTypes:
        'application/atom+xml application/geo+json application/javascript application/x-javascript application/json application/ld+json application/manifest+json application/rdf+xml application/rss+xml application/xhtml+xml application/xml font/eot font/otf font/ttf font/woff2 image/svg+xml text/css text/html text/javascript text/plain text/xml',
}

export interface CertbotCertCommandRule {
    /**
     * Matches both *.<domain> and <domain>, use '*' to match all domains
     */
    domain: string
    /**
     * The Certbot command to execute, will be parsed using `shell-quote`, available variables are `${domainName}` and `${subdomain}`
     */
    command?: string
}

const data = {
    configs: configs, // values that can be overridden

    // ******************** Global Constants *********************

    apiVersion: 'v2',

    isDebug: EnvVars.FLUKEDEPLOY_IS_DEBUG,

    serviceContainerPort3000: 3000,

    rootNameSpace: 'captain',

    // *********************** Disk Paths ************************

    defaultCaptainDefinitionPath: './flukedeploy-definition',

    dockerSocketPath: '/var/run/docker.sock',

    sourcePathInContainer: '/usr/src/app',

    nginxStaticRootDir: '/usr/share/nginx',

    flukedeployStaticFilesDir: FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/static',

    nginxSharedPathOnNginx: '/nginx-shared',

    nginxDhParamFileName: 'dhparam.pem',

    nginxDefaultHtmlDir: '/default',

    nginxSharedLogsPath: '/var/log/nginx-shared',

    goAccessCrontabPath: '/var/spool/cron/crontabs/root',

    letsEncryptEtcPathOnNginx: '/letencrypt/etc',

    nginxDomainSpecificHtmlDir: '/domains',

    flukedeployConfirmationPath: '/.well-known/flukedeploy-identifier',

    flukedeployBaseDirectory: FLUKEDEPLOY_BASE_DIRECTORY,

    restoreTarFilePath: FLUKEDEPLOY_BASE_DIRECTORY + '/backup.tar',

    restoreDirectoryPath: FLUKEDEPLOY_BASE_DIRECTORY + '/restoring',

    flukedeployRootDirectoryTemp: FLUKEDEPLOY_ROOT_DIRECTORY_TEMP,

    flukedeployRootDirectoryBackup: FLUKEDEPLOY_ROOT_DIRECTORY_TEMP + '/backup',

    flukedeployDownloadsDirectory: FLUKEDEPLOY_ROOT_DIRECTORY_TEMP + '/downloads',

    flukedeployRawSourceDirectoryBase: FLUKEDEPLOY_ROOT_DIRECTORY_TEMP + '/image_raw',

    flukedeployRootDirectoryGenerated: FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED,

    registryAuthPathOnHost: FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/registry-auth', // this is a file

    baseNginxConfigPath: FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/nginx/nginx.conf', // this is a file

    rootNginxConfigPath:
        FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/nginx/conf.d/flukedeploy-root',

    perAppNginxConfigPathBase:
        FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/nginx/conf.d',

    goaccessConfigPathBase: FLUKEDEPLOY_ROOT_DIRECTORY_GENERATED + '/goaccess',

    flukedeployDataDirectory: FLUKEDEPLOY_DATA_DIRECTORY,

    letsEncryptLibPath: FLUKEDEPLOY_DATA_DIRECTORY + '/letencrypt/lib',

    letsEncryptEtcPath: FLUKEDEPLOY_DATA_DIRECTORY + '/letencrypt/etc',

    registryPathOnHost: FLUKEDEPLOY_DATA_DIRECTORY + '/registry',

    nginxSharedPathOnHost: FLUKEDEPLOY_DATA_DIRECTORY + '/nginx-shared',

    nginxSharedLogsPathOnHost: FLUKEDEPLOY_DATA_DIRECTORY + '/shared-logs',

    debugSourceDirectory: '', // Only used in debug mode

    // ********************* Local Docker Constants  ************************

    flukedeploySaltSecretKey: 'flukedeploy-salt',

    nginxServiceName: 'flukedeploy-nginx',

    flukedeployServiceName: 'flukedeploy-flukedeploy',

    certbotServiceName: 'flukedeploy-certbot',

    goAccessContainerName: 'flukedeploy-goaccess-container',

    netDataContainerName: 'flukedeploy-netdata-container',

    registryServiceName: 'flukedeploy-registry',

    flukedeployNetworkName: 'flukedeploy-overlay-network',

    flukedeployRegistryUsername: 'captain',

    // ********************* HTTP Related Constants  ************************

    netDataRelativePath: '/net-data-monitor',

    healthCheckEndPoint: '/checkhealth',

    registrySubDomain: 'registry',

    headerCookieAuth: 'captainCookieAuth',

    headerAuth: 'x-flukedeploy-auth',

    headerAppToken: 'x-flukedeploy-app-token',

    headerNamespace: 'x-namespace',

    headerFlukeDeployVersion: 'x-flukedeploy-version',

    // *********************     ETC       ************************

    disableFirewallCommand:
        'ufw allow ' +
        configs.nginxPortNumber80 +
        ',' +
        configs.nginxPortNumber443 +
        ',' +
        configs.adminPortNumber3000 +
        ',996,7946,4789,2377/tcp; ufw allow 7946,4789,2377/udp; ',

    gitShaEnvVarKey: 'CAPROVER_GIT_COMMIT_SHA',
}

function overrideConfigFromFile(fileName: string) {
    const overridingValuesConfigs = fs.readJsonSync(fileName, {
        throws: false,
    })

    if (overridingValuesConfigs) {
        for (const prop in overridingValuesConfigs) {
            // eslint-disable-next-line no-prototype-builtins
            if (!overridingValuesConfigs.hasOwnProperty(prop)) {
                continue
            }

            console.log(`Overriding ${prop} from ${fileName}`)
            // @ts-expect-error "this actually works"
            configs[prop] = overridingValuesConfigs[prop]
        }
    }
}

overrideConfigFromFile(CONSTANT_FILE_OVERRIDE_BUILD)

overrideConfigFromFile(CONSTANT_FILE_OVERRIDE_USER)

if (data.isDebug) {
    const devDirectoryOnLocalMachine = fs
        .readFileSync(__dirname + '/../../currentdirectory')
        .toString()
        .trim()

    if (!devDirectoryOnLocalMachine) {
        throw new Error(
            'For development purposes, you need to assign your local directory here'
        )
    }

    data.debugSourceDirectory = devDirectoryOnLocalMachine
    data.configs.publishedNameOnDockerHub = 'flukedeploy-debug'
    // data.configs.nginxPortNumber80 = 80
}

export default data
