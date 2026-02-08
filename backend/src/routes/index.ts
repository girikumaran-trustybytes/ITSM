import { Router } from 'express'
import v1 from './v1.routes'

const router = Router()

// Mount versioned API under /v1 so endpoints become /api/v1/...
router.use('/v1', v1)

export default router
