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
exports.deleteTicket = exports.updateTicket = exports.unassignAsset = exports.assignAsset = exports.resolveTicket = exports.privateNote = exports.respond = exports.addHistory = exports.transitionTicket = exports.createTicket = exports.getTicket = exports.listTickets = void 0;
const ticketService = __importStar(require("./ticket.service"));
const listTickets = async (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    const q = String(req.query.q || '');
    const viewer = req.user;
    const tickets = await ticketService.getTickets({ page, pageSize, q }, viewer);
    res.json(tickets);
};
exports.listTickets = listTickets;
const getTicket = async (req, res) => {
    const viewer = req.user;
    const t = await ticketService.getTicketById(req.params.id, viewer);
    if (!t)
        return res.status(404).json({ error: 'Ticket not found' });
    if (viewer?.role === 'USER' && Array.isArray(t.history)) {
        ;
        t.history = t.history.filter((h) => !h.internal);
    }
    res.json(t);
};
exports.getTicket = getTicket;
const createTicket = async (req, res) => {
    try {
        const payload = req.validated?.body || req.body;
        const creator = req.user?.id || 'system';
        const role = req.user?.role;
        if (role === 'USER') {
            payload.requesterId = req.user?.id;
        }
        const t = await ticketService.createTicket(payload, creator);
        res.status(201).json(t);
    }
    catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).json({ error: err.message || 'Failed to create ticket' });
    }
};
exports.createTicket = createTicket;
const transitionTicket = async (req, res) => {
    const id = req.params.id;
    const { to } = req.validated?.body || req.body;
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
const addHistory = async (req, res) => {
    const id = req.params.id;
    const payload = req.validated?.body || req.body || {};
    const note = String(payload.note || '');
    if (!note || !note.trim())
        return res.status(400).json({ error: 'Note is required' });
    const user = req.user?.id || 'system';
    try {
        const entry = await ticketService.createHistoryEntry(id, { note, user });
        res.status(201).json(entry);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed creating history entry' });
    }
};
exports.addHistory = addHistory;
const respond = async (req, res) => {
    const id = req.params.id;
    const { message, sendEmail, to, cc, bcc, subject } = req.validated?.body || req.body || {};
    if (!message || !message.trim())
        return res.status(400).json({ error: 'Message is required' });
    const user = req.user?.id || 'system';
    try {
        const entry = await ticketService.addResponse(id, { message, user, sendEmail, to, cc, bcc, subject });
        res.status(201).json(entry);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to add response' });
    }
};
exports.respond = respond;
const privateNote = async (req, res) => {
    const id = req.params.id;
    const { note } = req.validated?.body || req.body || {};
    if (!note || !note.trim())
        return res.status(400).json({ error: 'Note is required' });
    const user = req.user?.id || 'system';
    try {
        const entry = await ticketService.addPrivateNote(id, { note, user });
        res.status(201).json(entry);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to add private note' });
    }
};
exports.privateNote = privateNote;
const resolveTicket = async (req, res) => {
    const id = req.params.id;
    const { resolution, resolutionCategory, sendEmail } = req.validated?.body || req.body || {};
    if (!resolution || !resolution.trim())
        return res.status(400).json({ error: 'Resolution details are required' });
    const user = req.user?.id || 'system';
    try {
        const updated = await ticketService.resolveTicketWithDetails(id, { resolution, resolutionCategory, user, sendEmail });
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to resolve ticket' });
    }
};
exports.resolveTicket = resolveTicket;
const assignAsset = async (req, res) => {
    const id = req.params.id;
    const { assetId } = req.validated?.body || req.body || {};
    if (!assetId)
        return res.status(400).json({ error: 'assetId is required' });
    const user = req.user?.id || 'system';
    try {
        const updated = await ticketService.assignAsset(id, Number(assetId), user);
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to assign asset' });
    }
};
exports.assignAsset = assignAsset;
const unassignAsset = async (req, res) => {
    const id = req.params.id;
    const user = req.user?.id || 'system';
    try {
        const updated = await ticketService.unassignAsset(id, user);
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to unassign asset' });
    }
};
exports.unassignAsset = unassignAsset;
const updateTicket = async (req, res) => {
    const id = req.params.id;
    const payload = req.validated?.body || req.body || {};
    const user = req.user?.id || 'system';
    try {
        const updated = await ticketService.updateTicket(id, payload, user);
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update ticket' });
    }
};
exports.updateTicket = updateTicket;
const deleteTicket = async (req, res) => {
    const id = req.params.id;
    const user = req.user?.id || 'system';
    try {
        const deleted = await ticketService.deleteTicket(id, user);
        res.json({ success: true, deleted });
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to delete ticket' });
    }
};
exports.deleteTicket = deleteTicket;
