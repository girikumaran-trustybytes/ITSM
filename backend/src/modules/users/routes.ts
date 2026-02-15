import { Router } from 'express'
import * as ctrl from './users.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { authorize } from '../../common/middleware/authorize.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), ctrl.list)
router.post('/rbac/ticket-actions', permit(['ADMIN']), authorize('admin', 'edit'), ctrl.addTicketCustomAction)
router.get('/:id/permissions', permit(['ADMIN','AGENT']), ctrl.getPermissions)
router.patch('/:id/permissions', permit(['ADMIN']), authorize('admin', 'edit'), ctrl.updatePermissions)
router.put('/:id/permissions', permit(['ADMIN']), authorize('admin', 'edit'), ctrl.updatePermissions)
router.post('/:id/send-invite', permit(['ADMIN']), authorize('user', 'edit'), ctrl.sendInvite)
router.post('/:id/mark-invite-pending', permit(['ADMIN']), authorize('user', 'edit'), ctrl.markInvitePending)
router.get('/:id', permit(['ADMIN','AGENT']), ctrl.getOne)
router.post('/', permit(['ADMIN']), ctrl.create)
router.patch('/:id', permit(['ADMIN']), ctrl.update)
router.delete('/:id', permit(['ADMIN']), ctrl.remove)

export default router
