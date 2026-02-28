import { Router } from 'express'
import ticketRoutes from '../../modules/tickets/routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ service: 'ticket-service', status: 'ok' })
})

router.use('/', ticketRoutes)

export default router
