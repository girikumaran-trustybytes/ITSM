import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { validate } from '../../common/middleware/validate.middleware'
import { eventsListQuerySchema } from './events.schema'
import * as ctrl from './events.controller'

const router = Router()

router.use(authenticateJWT)
router.get('/', permit(['ADMIN', 'AGENT', 'USER']), validate({ query: eventsListQuerySchema }), ctrl.list)

export default router

