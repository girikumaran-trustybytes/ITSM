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
exports.mitigateIncident = exports.acknowledgeIncident = exports.updateIncident = exports.createIncident = exports.getIncident = exports.listIncidents = void 0;
const incidentService = __importStar(require("./incidents.service"));
const listIncidents = async (req, res) => {
    const q = req.validated?.query || req.query || {};
    try {
        const rows = await incidentService.getIncidents(q, req.user);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to list incidents' });
    }
};
exports.listIncidents = listIncidents;
const getIncident = async (req, res) => {
    const id = req.validated?.params?.id || req.params.id;
    try {
        const t = await incidentService.getIncidentById(id);
        if (!t)
            return res.status(404).json({ error: 'Incident not found' });
        res.json(t);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to fetch incident' });
    }
};
exports.getIncident = getIncident;
const createIncident = async (req, res) => {
    try {
        const payload = req.validated?.body || req.body;
        const creator = req.user?.id || 'system';
        const t = await incidentService.createIncident(payload, creator);
        res.status(201).json(t);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to create incident' });
    }
};
exports.createIncident = createIncident;
const updateIncident = async (req, res) => {
    const id = req.validated?.params?.id || req.params.id;
    const payload = req.validated?.body || req.body;
    const user = req.user?.id || 'system';
    try {
        const updated = await incidentService.updateIncident(id, payload, user);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to update incident' });
    }
};
exports.updateIncident = updateIncident;
const acknowledgeIncident = async (req, res) => {
    const id = req.validated?.params?.id || req.params.id;
    const { assigneeId } = req.validated?.body || req.body || {};
    if (!assigneeId)
        return res.status(400).json({ error: 'assigneeId is required' });
    try {
        const updated = await incidentService.acknowledgeIncident(id, assigneeId);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to acknowledge incident' });
    }
};
exports.acknowledgeIncident = acknowledgeIncident;
const mitigateIncident = async (req, res) => {
    const id = req.validated?.params?.id || req.params.id;
    const { mitigation, mitigatedAt } = req.validated?.body || req.body || {};
    if (!mitigation || mitigation.trim().length === 0)
        return res.status(400).json({ error: 'mitigation is required' });
    try {
        const updated = await incidentService.mitigateIncident(id, mitigation, mitigatedAt);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to mitigate incident' });
    }
};
exports.mitigateIncident = mitigateIncident;
