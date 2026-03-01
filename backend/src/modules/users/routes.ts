import { Router } from 'express'
import * as ctrl from './users.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requireAnyPermission, requirePermission } from '../../common/middleware/permission.middleware'
import { authorize } from '../../common/middleware/authorize.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.users', 'user.view']), ctrl.list)
router.get('/me/presence', permit(['ADMIN','AGENT','USER','SUPPLIER','CUSTOM']), ctrl.getMyPresence)
router.put('/me/presence', permit(['ADMIN','AGENT','USER','SUPPLIER','CUSTOM']), ctrl.putMyPresence)
router.post('/rbac/ticket-actions', permit(['ADMIN']), requirePermission('system.configure'), authorize('admin', 'edit'), ctrl.addTicketCustomAction)
router.post('/invitations', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.createInvitation)
router.post('/invitations/:invitationId/resend', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.resendInvitation)
router.post('/invitations/:invitationId/revoke', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.revokeInvitation)
router.get('/:id/permissions', permit(['ADMIN']), requirePermission('system.configure'), ctrl.getPermissions)
router.patch('/:id/permissions', permit(['ADMIN']), requirePermission('system.configure'), authorize('admin', 'edit'), ctrl.updatePermissions)
router.put('/:id/permissions', permit(['ADMIN']), requirePermission('system.configure'), authorize('admin', 'edit'), ctrl.updatePermissions)
router.post('/:id/send-invite', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.sendInvite)
router.post('/:id/service-account/invite', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.sendServiceAccountInvite)
router.post('/:id/service-account/reinvite', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.reinviteServiceAccount)
router.post('/:id/mark-invite-pending', permit(['ADMIN']), requirePermission('system.configure'), authorize('user', 'edit'), ctrl.markInvitePending)
router.get('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.users', 'user.view']), ctrl.getOne)
router.post('/', permit(['ADMIN']), requirePermission('system.configure'), ctrl.create)
router.patch('/:id', permit(['ADMIN']), requirePermission('system.configure'), ctrl.update)
router.delete('/:id', permit(['ADMIN']), requirePermission('system.configure'), ctrl.remove)

export default router
