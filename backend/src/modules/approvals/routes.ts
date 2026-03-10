import { Router } from 'express'
import * as ctrl from './approvals.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'

const router = Router()

router.use(authenticateJWT)

router.post('/tickets/:ticketId/approvals', permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.createApproval)
router.get('/tickets/:ticketId/approvals', permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.listByTicket)
router.post('/approvals/:approvalId/approve', permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.approve)
router.post('/approvals/:approvalId/reject', permit(['ADMIN','AGENT']), requirePermission('ticket.update'), ctrl.reject)

export default router
