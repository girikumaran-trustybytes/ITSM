import { Router } from 'express'
import * as ctrl from './suppliers.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requireAnyPermission } from '../../common/middleware/permission.middleware'
import { authorize } from '../../common/middleware/authorize.middleware'
import { validate } from '../../common/middleware/validate.middleware'
import {
  supplierIdParamsSchema,
  suppliersCreateBodySchema,
  suppliersListQuerySchema,
  suppliersUpdateBodySchema,
} from './suppliers.schema'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.suppliers', 'supplier.view']), authorize('suppliers', 'view'), validate({ query: suppliersListQuerySchema }), ctrl.list)
router.post('/', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.suppliers', 'supplier.create']), authorize('suppliers', 'create'), validate({ body: suppliersCreateBodySchema }), ctrl.create)
router.get('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.suppliers', 'supplier.view']), authorize('suppliers', 'view'), validate({ params: supplierIdParamsSchema }), ctrl.getOne)
router.put('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.suppliers', 'supplier.edit']), authorize('suppliers', 'edit'), validate({ params: supplierIdParamsSchema, body: suppliersUpdateBodySchema }), ctrl.update)
router.delete('/:id', permit(['ADMIN','AGENT']), requireAnyPermission(['itsm.suppliers', 'supplier.edit']), authorize('suppliers', 'delete'), validate({ params: supplierIdParamsSchema }), ctrl.remove)

export default router
