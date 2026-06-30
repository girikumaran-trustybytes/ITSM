"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mitigateIncident = exports.acknowledgeIncident = exports.updateIncident = exports.createIncident = exports.getIncidentById = exports.getIncidents = void 0;
const db_1 = require("../../db");
const DEFAULT_INCIDENTS_PAGE = 1;
const DEFAULT_INCIDENTS_LIMIT = 20;
const MAX_INCIDENTS_PAGE = 100000;
const MAX_INCIDENTS_LIMIT = 100;
const INCIDENT_UPDATE_COLUMN_MAP = {
    title: 'title',
    description: 'description',
    severity: 'severity',
    assigneeId: 'assignee_id',
    status: 'status',
    mitigation: 'mitigation',
    impactedServices: 'impacted_services',
    tags: 'tags',
    metadata: 'metadata',
};
const INCIDENT_JSON_FIELDS = new Set(['impactedServices', 'tags', 'metadata']);
function normalizePositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.floor(parsed);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
async function getIncidents(filters = {}, viewer) {
    const where = [];
    const params = [];
    if (filters.severity) {
        params.push(filters.severity);
        where.push(`severity = $${params.length}`);
    }
    if (filters.status) {
        params.push(filters.status);
        where.push(`status = $${params.length}`);
    }
    if (filters.impactedService) {
        params.push(`%${filters.impactedService}%`);
        where.push(`impacted_services::text ILIKE $${params.length}`);
    }
    const page = clamp(normalizePositiveInt(filters.page, DEFAULT_INCIDENTS_PAGE), 1, MAX_INCIDENTS_PAGE);
    const limit = clamp(normalizePositiveInt(filters.limit, DEFAULT_INCIDENTS_LIMIT), 1, MAX_INCIDENTS_LIMIT);
    const offset = (page - 1) * limit;
    let sql = 'SELECT * FROM incidents';
    if (where.length)
        sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;
    sql += ` LIMIT $${limitParam} OFFSET $${offsetParam}`;
    return (0, db_1.query)(sql, params);
}
exports.getIncidents = getIncidents;
async function getIncidentById(id) {
    return (0, db_1.queryOne)('SELECT * FROM incidents WHERE id = $1', [id]);
}
exports.getIncidentById = getIncidentById;
async function createIncident(payload, creator) {
    const sql = `INSERT INTO incidents (title, description, severity, assignee_id, impacted_services, tags, metadata, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`;
    const params = [payload.title, payload.description || null, payload.severity || 'P3', payload.assigneeId || null, JSON.stringify(payload.impactedServices || []), JSON.stringify(payload.tags || []), payload.metadata || {}, creator];
    const rows = await (0, db_1.query)(sql, params);
    return rows[0];
}
exports.createIncident = createIncident;
async function updateIncident(id, payload, user) {
    const sets = [];
    const params = [];
    let idx = 1;
    const input = payload && typeof payload === 'object' ? payload : {};
    for (const key of Object.keys(input)) {
        const column = INCIDENT_UPDATE_COLUMN_MAP[key];
        if (!column)
            continue;
        if (INCIDENT_JSON_FIELDS.has(key)) {
            params.push(JSON.stringify(input[key] ?? null));
        }
        else {
            params.push(input[key]);
        }
        sets.push(`${column} = $${idx}`);
        idx++;
    }
    if (sets.length === 0)
        return getIncidentById(id);
    params.push(id);
    const sql = `UPDATE incidents SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
    const rows = await (0, db_1.query)(sql, params);
    return rows[0];
}
exports.updateIncident = updateIncident;
async function acknowledgeIncident(id, assigneeId) {
    const sql = `UPDATE incidents SET assignee_id = $1, status = 'investigating', updated_at = now() WHERE id = $2 RETURNING *`;
    const rows = await (0, db_1.query)(sql, [assigneeId, id]);
    return rows[0];
}
exports.acknowledgeIncident = acknowledgeIncident;
async function mitigateIncident(id, mitigation, mitigatedAt) {
    const sql = `UPDATE incidents SET mitigation = $1, status = 'mitigated', updated_at = now() WHERE id = $2 RETURNING *`;
    const rows = await (0, db_1.query)(sql, [mitigation, id]);
    return rows[0];
}
exports.mitigateIncident = mitigateIncident;
