import { Router } from 'express'
import * as ctrl from './incidents.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { permit } from '../../common/middleware/rbac.middleware'
import validate from '../../common/middleware/validate.middleware'
import { listIncidentsQuerySchema, createIncidentSchema, updateIncidentSchema, incidentParamsSchema, acknowledgeIncidentActionSchema, mitigateIncidentActionSchema } from './incidents.schema'

const router = Router()

router.use(authenticateJWT)

router.get('/', validate({ query: listIncidentsQuerySchema }), ctrl.listIncidents)
router.get('/:id', validate({ params: incidentParamsSchema }), ctrl.getIncident)
router.post('/', permit(['ADMIN','AGENT']), validate({ body: createIncidentSchema }), ctrl.createIncident)
router.patch('/:id', permit(['ADMIN','AGENT']), validate({ params: incidentParamsSchema, body: updateIncidentSchema }), ctrl.updateIncident)
router.post('/:id/acknowledge', permit(['ADMIN','AGENT']), validate({ params: incidentParamsSchema, body: acknowledgeIncidentActionSchema }), ctrl.acknowledgeIncident)
router.post('/:id/mitigate', permit(['ADMIN','AGENT']), validate({ params: incidentParamsSchema, body: mitigateIncidentActionSchema }), ctrl.mitigateIncident)

export default router
