"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTeamsWebhook = exports.sendEmail = exports.renderTemplate = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const templatesDir = path_1.default.join(__dirname, '../../services/notifications/templates');
async function renderTemplate(kind, name, data) {
    const file = path_1.default.join(templatesDir, kind, name);
    const t = await fs_1.default.promises.readFile(file, 'utf-8');
    return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => data[k] ?? '');
}
exports.renderTemplate = renderTemplate;
async function sendEmail(to, subject, templateName, data) {
    const body = await renderTemplate('email', templateName, data);
    console.log('[Notification] sendEmail', { to, subject, body: body.slice(0, 200) });
    return Promise.resolve(true);
}
exports.sendEmail = sendEmail;
async function sendTeamsWebhook(webhookUrl, templateName, data) {
    const payload = await renderTemplate('teams', templateName, data);
    console.log('[Notification] sendTeamsWebhook', { webhookUrl, payload: payload.slice(0, 200) });
    return Promise.resolve(true);
}
exports.sendTeamsWebhook = sendTeamsWebhook;
