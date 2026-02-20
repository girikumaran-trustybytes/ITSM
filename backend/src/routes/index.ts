import { Router } from 'express'
import ticketsRoutes from '../modules/tickets/routes'
import assetsRoutes from '../modules/assets/routes'
import authRoutes from '../modules/auth/auth.routes'
import approvalsRoutes from '../modules/approvals/routes'
import tasksRoutes from '../modules/tasks/routes'
import webhooksRoutes from '../modules/webhooks/routes'
import suppliersRoutes from '../modules/suppliers/routes'
import usersRoutes from '../modules/users/routes'
import slaRoutes from '../modules/sla/sla.routes'
import changesRoutes from '../modules/changes/changes.routes'
import problemsRoutes from '../modules/problems/problems.routes'
import servicesRoutes from '../modules/services/services.routes'
import incidentsRoutes from '../modules/incidents/routes'
import mailRoutes from '../modules/mail/mail.routes'
import eventsRoutes from '../modules/events/routes'
import notificationsRoutes from '../modules/notifications/notifications.routes'
import systemRoutes from '../modules/system/system.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/tickets', ticketsRoutes)
router.use('/assets', assetsRoutes)
// approvals and tasks use ticket-scoped paths under /tickets/:ticketId
router.use('/', approvalsRoutes)
router.use('/', tasksRoutes)
router.use('/webhooks', webhooksRoutes)
router.use('/suppliers', suppliersRoutes)
router.use('/users', usersRoutes)
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
