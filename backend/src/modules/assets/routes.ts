import { Router } from 'express'
import * as ctrl from './assets.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT','USER']), ctrl.list)
router.get('/my', permit(['ADMIN','AGENT','USER']), ctrl.listMine)
router.get('/:id', permit(['ADMIN','AGENT','USER']), ctrl.getOne)
router.post('/', permit(['ADMIN','AGENT']), ctrl.create)
router.patch('/:id', permit(['ADMIN','AGENT']), ctrl.update)
router.delete('/:id', permit(['ADMIN']), ctrl.remove)

export default router
