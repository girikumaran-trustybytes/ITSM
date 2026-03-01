import { Router } from 'express'
import * as ctrl from './assets.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requireAnyPermission, requirePermission } from '../../common/middleware/permission.middleware'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.assets', 'asset.view']), ctrl.list)
router.get('/my', permit(['ADMIN','AGENT','USER']), requireAnyPermission(['itsm.assets', 'portal.access']), ctrl.listMine)
router.get('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.assets', 'asset.view']), ctrl.getOne)
router.post('/', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.assets', 'asset.create']), ctrl.create)
router.patch('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.assets', 'asset.edit']), ctrl.update)
router.delete('/:id', permit(['ADMIN']), requirePermission('system.configure'), ctrl.remove)

export default router
