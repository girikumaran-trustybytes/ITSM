import { Router } from 'express'
import * as ctrl from './suppliers.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), ctrl.list)
router.post('/', permit(['ADMIN']), ctrl.create)
router.get('/:id', permit(['ADMIN','AGENT']), ctrl.getOne)
router.put('/:id', permit(['ADMIN']), ctrl.update)
router.delete('/:id', permit(['ADMIN']), ctrl.remove)

export default router
