import { Router } from 'express'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import * as ctrl from './announcements.controller'

const router = Router()

// public list for active announcements (used in notifications if needed)
router.get('/public', ctrl.listActive)

router.use(authenticateJWT)
router.use(permit(['ADMIN']))

router.get('/', ctrl.listAdmin)
router.post('/', ctrl.create)
router.put('/:id', ctrl.update)
router.delete('/:id', ctrl.remove)
router.post('/:id/repost', ctrl.repost)

export default router
