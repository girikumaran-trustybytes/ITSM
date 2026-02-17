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
const ctrl = __importStar(require("./ticket.controller"));
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const validate_middleware_1 = __importDefault(require("../../common/middleware/validate.middleware"));
const tickets_schema_1 = require("./tickets.schema");
const router = (0, express_1.Router)();
// require authenticated users
router.use(auth_middleware_1.authenticateJWT);
router.get('/', (0, validate_middleware_1.default)({ query: tickets_schema_1.ticketsListQuerySchema }), ctrl.listTickets);
router.get('/:id', (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema }), ctrl.getTicket);
router.post('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT', 'USER']), (0, validate_middleware_1.default)({ body: tickets_schema_1.ticketsCreateBodySchema }), ctrl.createTicket);
router.post('/:id/transition', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsTransitionBodySchema }), ctrl.transitionTicket);
// add timeline/history entry (note, internal action)
router.post('/:id/history', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsHistoryBodySchema }), ctrl.addHistory);
router.post('/:id/respond', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsRespondBodySchema }), ctrl.respond);
router.post('/:id/private-note', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsPrivateNoteBodySchema }), ctrl.privateNote);
router.post('/:id/attachments', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT', 'USER']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsUploadAttachmentsBodySchema }), ctrl.uploadAttachments);
router.post('/:id/resolve', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsResolveBodySchema }), ctrl.resolveTicket);
router.post('/:id/asset', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsAssignAssetBodySchema }), ctrl.assignAsset);
router.delete('/:id/asset', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema }), ctrl.unassignAsset);
router.patch('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema, body: tickets_schema_1.ticketsUpdateBodySchema }), ctrl.updateTicket);
router.delete('/:id', (0, rbac_middleware_1.permit)(['ADMIN']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema }), ctrl.deleteTicket);
router.get('/:id/audit', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, validate_middleware_1.default)({ params: tickets_schema_1.ticketIdParamsSchema }), (req, res) => Promise.resolve().then(() => __importStar(require('./audit.controller'))).then(m => m.getAudit(req, res)));
exports.default = router;
