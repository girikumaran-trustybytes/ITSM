"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhooks_controller_1 = require("./webhooks.controller");
const router = (0, express_1.Router)();
router.post('/notifications', webhooks_controller_1.handleNotificationWebhook);
exports.default = router;
