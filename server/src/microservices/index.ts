import { Router } from 'express'
import ticketServiceRouter from './tickets/router'
import assetServiceRouter from './assets/router'
import userServiceRouter from './users/router'
import supplierServiceRouter from './suppliers/router'

const router = Router()

router.use('/ticket-service', ticketServiceRouter)
router.use('/asset-service', assetServiceRouter)
router.use('/user-service', userServiceRouter)
router.use('/supplier-service', supplierServiceRouter)

export default router
