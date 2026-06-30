import { Router } from 'express'
import * as ctrl from './ticket.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requireAnyPermission, requirePermission } from '../../common/middleware/permission.middleware'
import validate from '../../common/middleware/validate.middleware'
import {
	ticketsListQuerySchema,
	ticketsCreateBodySchema,
	ticketsUpdateBodySchema,
	ticketIdParamsSchema,
	ticketsTransitionBodySchema,
	ticketsHistoryBodySchema,
	ticketsRespondBodySchema,
	ticketsPrivateNoteBodySchema,
	ticketsAssignAssetBodySchema,
	ticketsResolveBodySchema,
	ticketsUploadAttachmentsBodySchema,
} from './tickets.schema'

const router = Router()

// require authenticated users
router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['itsm.tickets', 'ticket.view', 'ticket.access', 'ticket.view.own']), validate({ query: ticketsListQuerySchema }), ctrl.listTickets)
router.get('/:id', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['itsm.tickets', 'ticket.view', 'ticket.access', 'ticket.view.own']), validate({ params: ticketIdParamsSchema }), ctrl.getTicket)
router.post('/', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['ticket.create', 'ticket.access']), validate({ body: ticketsCreateBodySchema }), ctrl.createTicket)
router.post('/:id/transition', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema, body: ticketsTransitionBodySchema }), ctrl.transitionTicket)
router.post('/:id/mark-responded', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema }), ctrl.markResponded)
// add timeline/history entry (note, internal action)
router.post('/:id/history', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['ticket.update', 'ticket.update.own']), validate({ params: ticketIdParamsSchema, body: ticketsHistoryBodySchema }), ctrl.addHistory)
router.post('/:id/respond', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['ticket.update', 'ticket.update.own']), validate({ params: ticketIdParamsSchema, body: ticketsRespondBodySchema }), ctrl.respond)
router.post('/:id/private-note', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema, body: ticketsPrivateNoteBodySchema }), ctrl.privateNote)
router.post('/:id/attachments', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['ticket.update', 'ticket.update.own']), validate({ params: ticketIdParamsSchema, body: ticketsUploadAttachmentsBodySchema }), ctrl.uploadAttachments)
router.post('/:id/resolve', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema, body: ticketsResolveBodySchema }), ctrl.resolveTicket)
router.post('/:id/asset', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema, body: ticketsAssignAssetBodySchema }), ctrl.assignAsset)
router.delete('/:id/asset', permit(['ADMIN','AGENT']), requireAnyPermission(['ticket.update', 'ticket.access']), validate({ params: ticketIdParamsSchema }), ctrl.unassignAsset)
router.patch('/:id', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['ticket.update', 'ticket.update.own']), validate({ params: ticketIdParamsSchema, body: ticketsUpdateBodySchema }), ctrl.updateTicket)
router.delete('/:id', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: ticketIdParamsSchema }), ctrl.deleteTicket)
router.get('/:id/audit', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: ticketIdParamsSchema }), (req, res) => import('./audit.controller').then(m => m.getAudit(req, res)))

export default router
