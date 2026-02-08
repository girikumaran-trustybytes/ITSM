import { Router } from 'express'
import * as ctrl from './ticket.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'

const router = Router()

// require authenticated users
router.use(authenticateJWT)

router.get('/', ctrl.listTickets)
router.get('/:id', ctrl.getTicket)
router.post('/', permit(['ADMIN','AGENT','USER']), ctrl.createTicket)
router.post('/:id/transition', permit(['ADMIN','AGENT']), ctrl.transitionTicket)
// add timeline/history entry (note, internal action)
router.post('/:id/history', permit(['ADMIN','AGENT']), ctrl.addHistory)
router.post('/:id/respond', permit(['ADMIN','AGENT']), ctrl.respond)
router.post('/:id/private-note', permit(['ADMIN','AGENT']), ctrl.privateNote)
router.post('/:id/resolve', permit(['ADMIN','AGENT']), ctrl.resolveTicket)
router.post('/:id/asset', permit(['ADMIN','AGENT']), ctrl.assignAsset)
router.delete('/:id/asset', permit(['ADMIN','AGENT']), ctrl.unassignAsset)
router.patch('/:id', permit(['ADMIN','AGENT']), ctrl.updateTicket)
router.delete('/:id', permit(['ADMIN']), ctrl.deleteTicket)
router.get('/:id/audit', permit(['ADMIN','AGENT']), (req, res) => import('./audit.controller').then(m => m.getAudit(req, res)))

export default router
