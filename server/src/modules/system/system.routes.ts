import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './system.controller'

const router = Router()

router.use(authenticateJWT)

router.get('/database/config', permit(['ADMIN']), ctrl.getDatabaseConfig)
router.post('/database/test', permit(['ADMIN']), ctrl.testDatabaseConfig)
router.get('/security-settings', permit(['ADMIN']), ctrl.getSecuritySettings)
router.put('/security-settings', permit(['ADMIN']), ctrl.updateSecuritySettings)
router.get('/account-settings', permit(['ADMIN']), ctrl.getAccountSettings)
router.put('/account-settings', permit(['ADMIN']), ctrl.updateAccountSettings)
router.post('/account-settings/export', permit(['ADMIN']), ctrl.exportAccountData)
router.post('/account-settings/cancel', permit(['ADMIN']), ctrl.cancelAccount)
router.get('/asset-types', permit(['ADMIN', 'AGENT']), ctrl.getAssetTypesSettings)
router.put('/asset-types', permit(['ADMIN']), ctrl.updateAssetTypesSettings)

export default router
