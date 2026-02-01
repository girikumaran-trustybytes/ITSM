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
router.get('/:id/audit', permit(['ADMIN','AGENT']), (req, res) => import('./audit.controller').then(m => m.getAudit(req, res)))

export default router
