import { Router } from 'express'
import assetRoutes from '../../modules/assets/routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ service: 'asset-service', status: 'ok' })
})

router.use('/', assetRoutes)

export default router
