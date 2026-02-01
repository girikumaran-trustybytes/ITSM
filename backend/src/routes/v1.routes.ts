import { Router } from 'express'
import ticketsRoutes from '../modules/tickets/routes'
import assetsRoutes from '../modules/assets/routes'
import authRoutes from '../modules/auth/auth.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/tickets', ticketsRoutes)
router.use('/assets', assetsRoutes)

export default router
