import { Router } from 'express'
import * as ctrl from './tasks.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'

const router = Router()
router.post('/tickets/:ticketId/tasks', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.createTask)
router.get('/tickets/:ticketId/tasks', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.listByTicket)
router.post('/tasks/:taskId/status', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.updateStatus)

export default router
