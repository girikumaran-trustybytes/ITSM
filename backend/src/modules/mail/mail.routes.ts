import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './mail.controller'

const router = Router()

router.use(authenticateJWT)
router.use(permit(['ADMIN']))

router.get('/config', ctrl.getConfig)
router.post('/config/inbound', ctrl.updateInboundRouting)
router.post('/smtp/test', ctrl.testSmtp)
router.post('/imap/test', ctrl.testImap)
router.post('/smtp/send', ctrl.sendTestMail)

export default router
