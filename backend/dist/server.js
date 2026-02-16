"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./load-env");
const app_1 = __importDefault(require("./app"));
// start background jobs (SLA checks, notifications)
require("./jobs/sla.job");
const mail_to_ticket_job_1 = require("./jobs/mail-to-ticket.job");
// import { startSlaWorker } from './jobs/sla.worker'
const logger_1 = __importDefault(require("./common/logger/logger"));
const PORT = Number(process.env.PORT || 5000);
const server = app_1.default.listen(PORT, () => {
    logger_1.default.info(`Server running on http://localhost:${PORT}`);
    // SLA worker disabled temporarily - will re-enable after core functionality verified
    // startSlaWorker()
    (0, mail_to_ticket_job_1.startMailToTicketJob)();
});
server.on('error', (err) => {
    logger_1.default.info('Server error:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.info('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
    logger_1.default.info('Uncaught exception:', err);
    process.exit(1);
});
