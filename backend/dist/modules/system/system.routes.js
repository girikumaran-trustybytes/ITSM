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
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const ctrl = __importStar(require("./system.controller"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
router.get('/database/config', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.getDatabaseConfig);
router.post('/database/test', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.testDatabaseConfig);
router.get('/security-settings', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.getSecuritySettings);
router.put('/security-settings', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.updateSecuritySettings);
router.get('/account-settings', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.getAccountSettings);
router.put('/account-settings', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.updateAccountSettings);
router.post('/account-settings/export', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.exportAccountData);
router.post('/account-settings/cancel', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.cancelAccount);
router.get('/asset-types', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), ctrl.getAssetTypesSettings);
router.put('/asset-types', (0, rbac_middleware_1.permit)(['ADMIN']), ctrl.updateAssetTypesSettings);
exports.default = router;
