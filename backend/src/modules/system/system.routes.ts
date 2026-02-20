import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './system.controller'

const router = Router()

router.use(authenticateJWT)
router.use(permit(['ADMIN']))

router.get('/database/config', ctrl.getDatabaseConfig)
router.post('/database/test', ctrl.testDatabaseConfig)

export default router
