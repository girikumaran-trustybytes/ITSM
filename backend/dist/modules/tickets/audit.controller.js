"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAudit = void 0;
const logger_1 = require("../../common/logger/logger");
const getAudit = (req, res) => {
    const id = req.params.id;
    const a = (0, logger_1.getAuditByTicketId)(id);
    res.json(a);
};
exports.getAudit = getAudit;
