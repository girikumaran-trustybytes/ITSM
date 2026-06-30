import { Router } from 'express'
import * as ctrl from './incidents.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'
import validate from '../../common/middleware/validate.middleware'
import { listIncidentsQuerySchema, createIncidentSchema, updateIncidentSchema, incidentParamsSchema, acknowledgeIncidentActionSchema, mitigateIncidentActionSchema } from './incidents.schema'

const router = Router()

router.use(authenticateJWT)

router.get('/', permit(['ADMIN']), requirePermission('system.configure'), validate({ query: listIncidentsQuerySchema }), ctrl.listIncidents)
router.get('/:id', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: incidentParamsSchema }), ctrl.getIncident)
router.post('/', permit(['ADMIN']), requirePermission('system.configure'), validate({ body: createIncidentSchema }), ctrl.createIncident)
router.patch('/:id', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: incidentParamsSchema, body: updateIncidentSchema }), ctrl.updateIncident)
router.post('/:id/acknowledge', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: incidentParamsSchema, body: acknowledgeIncidentActionSchema }), ctrl.acknowledgeIncident)
router.post('/:id/mitigate', permit(['ADMIN']), requirePermission('system.configure'), validate({ params: incidentParamsSchema, body: mitigateIncidentActionSchema }), ctrl.mitigateIncident)

export default router
