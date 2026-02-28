import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './notifications.controller'

const router = Router()

router.use(authenticateJWT)
router.get('/', permit(['ADMIN', 'AGENT', 'USER']), ctrl.list)
router.get('/state', permit(['ADMIN', 'AGENT', 'USER']), ctrl.getState)
router.put('/state', permit(['ADMIN', 'AGENT', 'USER']), ctrl.putState)

export default router
