import { Router } from 'express'
import * as ctrl from './approvals.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'

const router = Router()
router.post('/tickets/:ticketId/approvals', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.createApproval)
router.get('/tickets/:ticketId/approvals', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.listByTicket)
router.post('/approvals/:approvalId/approve', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.approve)
router.post('/approvals/:approvalId/reject', authenticateJWT, permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.reject)

export default router
