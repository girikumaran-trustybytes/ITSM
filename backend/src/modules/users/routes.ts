import { Router } from 'express'
import * as ctrl from './users.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), ctrl.list)
router.get('/:id', permit(['ADMIN','AGENT']), ctrl.getOne)
router.post('/', permit(['ADMIN']), ctrl.create)
router.patch('/:id', permit(['ADMIN']), ctrl.update)
router.delete('/:id', permit(['ADMIN']), ctrl.remove)

export default router
