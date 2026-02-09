import { Router } from 'express'
import * as ctrl from './ticket.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import validate from '../../common/middleware/validate.middleware'
import {
	listTicketsQuerySchema,
	createTicketSchema,
	updateTicketSchema,
	ticketIdParamSchema,
	transitionTicketSchema,
	historyActionSchema,
	respondActionSchema,
	privateNoteActionSchema,
	assignAssetActionSchema,
	resolveTicketActionSchema,
} from './tickets.schema'

const router = Router()

// require authenticated users
router.use(authenticateJWT)

router.get('/', validate({ query: listTicketsQuerySchema }), ctrl.listTickets)
router.get('/:id', validate({ params: ticketIdParamSchema }), ctrl.getTicket)
router.post('/', permit(['ADMIN','AGENT','USER']), validate({ body: createTicketSchema }), ctrl.createTicket)
router.post('/:id/transition', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: transitionTicketSchema }), ctrl.transitionTicket)
// add timeline/history entry (note, internal action)
router.post('/:id/history', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: historyActionSchema }), ctrl.addHistory)
router.post('/:id/respond', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: respondActionSchema }), ctrl.respond)
router.post('/:id/private-note', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: privateNoteActionSchema }), ctrl.privateNote)
router.post('/:id/resolve', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: resolveTicketActionSchema }), ctrl.resolveTicket)
router.post('/:id/asset', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: assignAssetActionSchema }), ctrl.assignAsset)
router.delete('/:id/asset', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema }), ctrl.unassignAsset)
router.patch('/:id', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema, body: updateTicketSchema }), ctrl.updateTicket)
router.delete('/:id', permit(['ADMIN']), validate({ params: ticketIdParamSchema }), ctrl.deleteTicket)
router.get('/:id/audit', permit(['ADMIN','AGENT']), validate({ params: ticketIdParamSchema }), (req, res) => import('./audit.controller').then(m => m.getAudit(req, res)))

export default router
