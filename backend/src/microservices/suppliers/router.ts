import { Router } from 'express'
import supplierRoutes from '../../modules/suppliers/routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ service: 'supplier-service', status: 'ok' })
})

router.use('/', supplierRoutes)

export default router
