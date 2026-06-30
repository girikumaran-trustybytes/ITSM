import { Router } from 'express'
import userRoutes from '../../modules/users/routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ service: 'user-service', status: 'ok' })
})

router.use('/', userRoutes)

export default router
