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
const ctrl = __importStar(require("./users.controller"));
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const authorize_middleware_1 = require("../../common/middleware/authorize.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
router.get('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.list);
router.get('/me/presence', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM']), ctrl.getMyPresence);
router.put('/me/presence', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM']), ctrl.putMyPresence);
router.post('/rbac/ticket-actions', (0, rbac_middleware_1.permit)(['ADMIN']), (0, authorize_middleware_1.authorize)('admin', 'edit'), ctrl.addTicketCustomAction);
router.get('/:id/permissions', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.getPermissions);
router.patch('/:id/permissions', (0, rbac_middleware_1.permit)(['ADMIN']), (0, authorize_middleware_1.authorize)('admin', 'edit'), ctrl.updatePermissions);
router.put('/:id/permissions', (0, rbac_middleware_1.permit)(['ADMIN']), (0, authorize_middleware_1.authorize)('admin', 'edit'), ctrl.updatePermissions);
router.post('/:id/send-invite', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('user', 'edit'), ctrl.sendInvite);
router.post('/:id/service-account/invite', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('user', 'edit'), ctrl.sendServiceAccountInvite);
router.post('/:id/service-account/reinvite', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('user', 'edit'), ctrl.reinviteServiceAccount);
router.post('/:id/mark-invite-pending', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('user', 'edit'), ctrl.markInvitePending);
router.get('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.getOne);
router.post('/', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.create);
router.patch('/:id', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.update);
router.delete('/:id', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.remove);
exports.default = router;
