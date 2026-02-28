import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes'
import approvalsRoutes from '../modules/approvals/routes'
import tasksRoutes from '../modules/tasks/routes'
import webhooksRoutes from '../modules/webhooks/routes'
import slaRoutes from '../modules/sla/sla.routes'
import changesRoutes from '../modules/changes/changes.routes'
import problemsRoutes from '../modules/problems/problems.routes'
import servicesRoutes from '../modules/services/services.routes'
import incidentsRoutes from '../modules/incidents/routes'
import mailRoutes from '../modules/mail/mail.routes'
import eventsRoutes from '../modules/events/routes'
import notificationsRoutes from '../modules/notifications/notifications.routes'
import systemRoutes from '../modules/system/system.routes'
import microservicesRouter from '../microservices'
import ticketServiceRouter from '../microservices/tickets/router'
import assetServiceRouter from '../microservices/assets/router'
import userServiceRouter from '../microservices/users/router'
import supplierServiceRouter from '../microservices/suppliers/router'

const router = Router()

router.use('/auth', authRoutes)
router.use('/microservices', microservicesRouter)
router.use('/tickets', ticketServiceRouter)
router.use('/ticket', ticketServiceRouter)
router.use('/assets', assetServiceRouter)
router.use('/asset', assetServiceRouter)
// approvals and tasks use ticket-scoped paths under /tickets/:ticketId
router.use('/', approvalsRoutes)
router.use('/', tasksRoutes)
router.use('/webhooks', webhooksRoutes)
router.use('/suppliers', supplierServiceRouter)
router.use('/supplier', supplierServiceRouter)
router.use('/users', userServiceRouter)
router.use('/user', userServiceRouter)
router.use('/sla', slaRoutes)
router.use('/changes', changesRoutes)
router.use('/problems', problemsRoutes)
router.use('/services', servicesRoutes)
router.use('/incidents', incidentsRoutes)
router.use('/mail', mailRoutes)
router.use('/events', eventsRoutes)
router.use('/notifications', notificationsRoutes)
router.use('/system', systemRoutes)

export default router
