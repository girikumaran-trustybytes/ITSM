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
exports.transitionTicket = exports.createTicket = exports.getTicket = exports.listTickets = void 0;
const ticketService = __importStar(require("./ticket.service"));
const ticket_validator_1 = require("./ticket.validator");
const listTickets = async (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    const q = String(req.query.q || '');
    const tickets = await ticketService.getTickets({ page, pageSize, q });
    res.json(tickets);
};
exports.listTickets = listTickets;
const getTicket = async (req, res) => {
    const t = await ticketService.getTicketById(req.params.id);
    if (!t)
        return res.status(404).json({ error: 'Ticket not found' });
    res.json(t);
};
exports.getTicket = getTicket;
const createTicket = async (req, res) => {
    const payload = req.body;
    const check = (0, ticket_validator_1.validateCreate)(payload);
    if (!check.ok)
        return res.status(400).json({ error: check.message });
    const creator = req.user?.id || 'system';
    const t = await ticketService.createTicket(payload, creator);
    res.status(201).json(t);
};
exports.createTicket = createTicket;
const transitionTicket = async (req, res) => {
    const id = req.params.id;
    const check = (0, ticket_validator_1.validateTransition)(req.body);
    if (!check.ok)
        return res.status(400).json({ error: check.message });
    const { to } = req.body;
    const user = req.user?.id || 'system';
    try {
        const t = await ticketService.transitionTicket(id, to, user);
        res.json(t);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed transition' });
    }
};
exports.transitionTicket = transitionTicket;
