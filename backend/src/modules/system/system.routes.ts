import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './system.controller'

const router = Router()

router.use(authenticateJWT)
router.use(permit(['ADMIN']))

router.get('/database/config', ctrl.getDatabaseConfig)
router.post('/database/test', ctrl.testDatabaseConfig)
router.get('/security-settings', ctrl.getSecuritySettings)
router.put('/security-settings', ctrl.updateSecuritySettings)
router.get('/account-settings', ctrl.getAccountSettings)
router.put('/account-settings', ctrl.updateAccountSettings)
router.post('/account-settings/export', ctrl.exportAccountData)
router.post('/account-settings/cancel', ctrl.cancelAccount)

export default router
