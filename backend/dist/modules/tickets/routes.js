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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ctrl = __importStar(require("./ticket.controller"));
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const router = (0, express_1.Router)();
// require authenticated users
router.use(auth_middleware_1.authenticateJWT);
router.get('/', ctrl.listTickets);
router.get('/:id', ctrl.getTicket);
router.post('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT', 'USER']), ctrl.createTicket);
router.post('/:id/transition', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.transitionTicket);
// add timeline/history entry (note, internal action)
router.post('/:id/history', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.addHistory);
router.post('/:id/respond', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.respond);
router.post('/:id/private-note', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.privateNote);
router.post('/:id/resolve', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.resolveTicket);
router.post('/:id/asset', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.assignAsset);
router.delete('/:id/asset', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.unassignAsset);
router.patch('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.updateTicket);
router.delete('/:id', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.deleteTicket);
router.get('/:id/audit', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (req, res) => Promise.resolve().then(() => __importStar(require('./audit.controller'))).then(m => m.getAudit(req, res)));
exports.default = router;
