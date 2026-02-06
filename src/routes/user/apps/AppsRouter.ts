import AppDataRouter from './appdata/AppDataRouter'
import AppDefinitionRouter from './appdefinition/AppDefinitionRouter'
import DeploymentRouter from './deployment/DeploymentRouter'
import WebhooksRouter from './webhooks/WebhooksRouter'

import express = require('express')

const router = express.Router()

router.use('/appDefinitions/', AppDefinitionRouter)

router.use('/appData/', AppDataRouter)

router.use('/deployments/', DeploymentRouter)

// semi-secured end points:
router.use('/webhooks/', WebhooksRouter)

export default router
