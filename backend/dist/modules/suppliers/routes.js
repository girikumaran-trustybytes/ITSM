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
const ctrl = __importStar(require("./suppliers.controller"));
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const rbac_middleware_1 = require("../../common/middleware/rbac.middleware");
const authorize_middleware_1 = require("../../common/middleware/authorize.middleware");
const validate_middleware_1 = require("../../common/middleware/validate.middleware");
const suppliers_schema_1 = require("./suppliers.schema");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
router.get('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('suppliers', 'view'), (0, validate_middleware_1.validate)({ query: suppliers_schema_1.suppliersListQuerySchema }), ctrl.list);
router.post('/', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('suppliers', 'create'), (0, validate_middleware_1.validate)({ body: suppliers_schema_1.suppliersCreateBodySchema }), ctrl.create);
router.get('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('suppliers', 'view'), (0, validate_middleware_1.validate)({ params: suppliers_schema_1.supplierIdParamsSchema }), ctrl.getOne);
router.put('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('suppliers', 'edit'), (0, validate_middleware_1.validate)({ params: suppliers_schema_1.supplierIdParamsSchema, body: suppliers_schema_1.suppliersUpdateBodySchema }), ctrl.update);
router.delete('/:id', (0, rbac_middleware_1.permit)(['ADMIN', 'AGENT']), (0, authorize_middleware_1.authorize)('suppliers', 'delete'), (0, validate_middleware_1.validate)({ params: suppliers_schema_1.supplierIdParamsSchema }), ctrl.remove);
exports.default = router;
