"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ctrl = __importStar(require("./incidents.controller"));
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const validate_middleware_1 = __importDefault(require("../../common/middleware/validate.middleware"));
const incidents_schema_1 = require("./incidents.schema");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
router.get('/', (0, validate_middleware_1.default)({ query: incidents_schema_1.listIncidentsQuerySchema }), ctrl.listIncidents);
router.get('/:id', (0, validate_middleware_1.default)({ params: incidents_schema_1.incidentParamsSchema }), ctrl.getIncident);
router.post('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ body: incidents_schema_1.createIncidentSchema }), ctrl.createIncident);
router.patch('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: incidents_schema_1.incidentParamsSchema, body: incidents_schema_1.updateIncidentSchema }), ctrl.updateIncident);
router.post('/:id/acknowledge', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: incidents_schema_1.incidentParamsSchema, body: incidents_schema_1.acknowledgeIncidentActionSchema }), ctrl.acknowledgeIncident);
router.post('/:id/mitigate', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: incidents_schema_1.incidentParamsSchema, body: incidents_schema_1.mitigateIncidentActionSchema }), ctrl.mitigateIncident);
exports.default = router;
