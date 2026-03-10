"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleNotificationWebhook = void 0;
async function handleNotificationWebhook(req, res) {
    // Simple passthrough webhook handler — in production verify signature
    console.log('[Webhook] received', { body: req.body });
    res.json({ received: true });
}
exports.handleNotificationWebhook = handleNotificationWebhook;
