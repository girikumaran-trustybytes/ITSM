import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'
import * as ctrl from './notifications.controller'

const router = Router()

router.use(authenticateJWT)
router.get('/', permit(['ADMIN', 'AGENT']), requirePermission('itsm.dashboard'), ctrl.list)
router.get('/state', permit(['ADMIN', 'AGENT']), requirePermission('itsm.dashboard'), ctrl.getState)
router.put('/state', permit(['ADMIN', 'AGENT']), requirePermission('itsm.dashboard'), ctrl.putState)

export default router
