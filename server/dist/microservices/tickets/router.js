"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const routes_1 = __importDefault(require("../../modules/tickets/routes"));
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.json({ service: 'ticket-service', status: 'ok' });
});
router.use('/', routes_1.default);
exports.default = router;
