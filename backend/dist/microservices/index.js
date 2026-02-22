"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router_1 = __importDefault(require("./tickets/router"));
const router_2 = __importDefault(require("./assets/router"));
const router_3 = __importDefault(require("./users/router"));
const router_4 = __importDefault(require("./suppliers/router"));
const router = (0, express_1.Router)();
router.use('/ticket-service', router_1.default);
router.use('/asset-service', router_2.default);
router.use('/user-service', router_3.default);
router.use('/supplier-service', router_4.default);
exports.default = router;
