import { Router } from 'express'
import * as ctrl from './tasks.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'

const router = Router()

router.use(authenticateJWT)

router.post('/tickets/:ticketId/tasks', permit(['ADMIN','AGENT']), ctrl.createTask)
router.get('/tickets/:ticketId/tasks', permit(['ADMIN','AGENT','USER']), ctrl.listByTicket)
router.post('/tasks/:taskId/status', permit(['ADMIN','AGENT']), ctrl.updateStatus)

export default router
