import { Router } from 'express'
import v1 from './v1.routes'

const router = Router()

router.use('/v1', v1)

// Keep root /api routes backwards compatible (v1 as default)
router.use('/', v1)

export default router
