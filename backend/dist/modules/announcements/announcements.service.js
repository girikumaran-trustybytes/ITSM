"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repostAnnouncement = exports.deleteAnnouncement = exports.updateAnnouncement = exports.createAnnouncement = exports.listActiveAnnouncements = exports.listAnnouncementsAdmin = void 0;
const db_1 = require("../../db");
let ensureTablePromise = null;
async function ensureAnnouncementsTable() {
    if (!ensureTablePromise) {
        ensureTablePromise = (async () => {
            await (0, db_1.query)(`
        CREATE TABLE IF NOT EXISTS "Announcement" (
          "id" SERIAL PRIMARY KEY,
          "title" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "type" TEXT NOT NULL DEFAULT 'maintenance',
          "status" TEXT NOT NULL DEFAULT 'draft',
          "publishAt" TIMESTAMP(3),
          "expireAt" TIMESTAMP(3),
          "repeatInterval" TEXT NOT NULL DEFAULT 'none',
          "createdBy" INTEGER,
          "updatedBy" INTEGER,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await (0, db_1.query)(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "repeatInterval" TEXT NOT NULL DEFAULT 'none'`);
        })().catch((err) => {
            ensureTablePromise = null;
            throw err;
        });
    }
    await ensureTablePromise;
}
function normalizeStatus(status, publishAt) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'draft')
        return 'draft';
    if (normalized === 'expired')
        return 'expired';
    if (normalized === 'scheduled')
        return 'scheduled';
    if (normalized === 'published')
        return 'published';
    if (publishAt)
        return 'scheduled';
    return 'draft';
}
function normalizeType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'general' ? 'general' : 'maintenance';
}
function normalizeRepeat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'daily')
        return 'daily';
    if (normalized === 'weekly')
        return 'weekly';
    if (normalized === 'monthly')
        return 'monthly';
    if (normalized === 'on_login')
        return 'on_login';
    return 'none';
}
function toTimestamp(value) {
    if (!value)
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return date.toISOString();
}
async function touchRepeatingAnnouncements(type) {
    const params = [];
    const conditions = [];
    conditions.push(`"repeatInterval" IS NOT NULL`);
    conditions.push(`"repeatInterval" <> 'none'`);
    conditions.push(`"status" <> 'expired'`);
    conditions.push(`"status" <> 'draft'`);
    conditions.push(`("expireAt" IS NULL OR "expireAt" > NOW())`);
    if (type) {
        params.push(type);
        conditions.push(`"type" = $${params.length}`);
    }
    const rows = await (0, db_1.query)(`SELECT "id", "repeatInterval", "publishAt", "createdAt"
     FROM "Announcement"
     WHERE ${conditions.join(' AND ')}`, params);
    if (!rows.length)
        return;
    const now = new Date();
    const updates = [];
    for (const row of rows) {
        const repeat = normalizeRepeat(row.repeatInterval);
        if (repeat === 'none')
            continue;
        if (repeat === 'on_login') {
            updates.push(Number(row.id));
            continue;
        }
        const baseRaw = row.publishAt || row.createdAt;
        if (!baseRaw)
            continue;
        const base = new Date(baseRaw);
        if (Number.isNaN(base.getTime()))
            continue;
        let next = new Date(base);
        if (repeat === 'daily') {
            next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
        }
        else if (repeat === 'weekly') {
            next = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
        }
        else if (repeat === 'monthly') {
            next = new Date(base);
            next.setMonth(base.getMonth() + 1);
        }
        if (now >= next) {
            updates.push(Number(row.id));
        }
    }
    if (updates.length) {
        await (0, db_1.query)(`UPDATE "Announcement"
       SET "publishAt" = NOW(),
           "status" = 'published',
           "updatedAt" = NOW()
       WHERE "id" = ANY($1::int[])`, [updates]);
    }
}
async function listAnnouncementsAdmin() {
    await ensureAnnouncementsTable();
    const rows = await (0, db_1.query)(`SELECT
      "id",
      "title",
      "body",
      "type",
      "status",
      "repeatInterval",
      "publishAt",
      "expireAt",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt"
     FROM "Announcement"
     ORDER BY COALESCE("publishAt", "createdAt") DESC, "createdAt" DESC`);
    return rows;
}
exports.listAnnouncementsAdmin = listAnnouncementsAdmin;
async function listActiveAnnouncements(type) {
    await ensureAnnouncementsTable();
    await touchRepeatingAnnouncements(type);
    const params = [];
    const conditions = [];
    conditions.push(`("status" = 'published' OR "status" = 'scheduled')`);
    conditions.push(`("publishAt" IS NULL OR "publishAt" <= NOW())`);
    conditions.push(`("expireAt" IS NULL OR "expireAt" > NOW())`);
    if (type) {
        params.push(type);
        conditions.push(`"type" = $${params.length}`);
    }
    const rows = await (0, db_1.query)(`SELECT
      "id",
      "title",
      "body",
      "type",
      "status",
      "repeatInterval",
      "publishAt",
      "expireAt",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt"
     FROM "Announcement"
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE("publishAt", "createdAt") DESC, "createdAt" DESC`, params);
    return rows;
}
exports.listActiveAnnouncements = listActiveAnnouncements;
async function createAnnouncement(payload, userId) {
    await ensureAnnouncementsTable();
    const title = String(payload?.title || '').trim();
    const body = String(payload?.body || '').trim();
    if (!title)
        throw { status: 400, message: 'Title is required' };
    if (!body)
        throw { status: 400, message: 'Body is required' };
    const publishAt = toTimestamp(payload?.publishAt);
    const expireAt = toTimestamp(payload?.expireAt);
    const type = normalizeType(payload?.type);
    const status = normalizeStatus(payload?.status, publishAt);
    const repeatInterval = normalizeRepeat(payload?.repeatInterval);
    const rows = await (0, db_1.query)(`INSERT INTO "Announcement"
      ("title", "body", "type", "status", "repeatInterval", "publishAt", "expireAt", "createdBy", "updatedBy", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4,
      $5, $6::timestamptz,
      $7::timestamptz,
      $8, $8, NOW(), NOW())
     RETURNING *`, [
        title,
        body,
        type,
        status,
        repeatInterval,
        publishAt ?? null,
        expireAt ?? null,
        userId ?? null,
    ]);
    return rows[0];
}
exports.createAnnouncement = createAnnouncement;
async function updateAnnouncement(id, payload, userId) {
    await ensureAnnouncementsTable();
    const title = payload?.title !== undefined ? String(payload.title || '').trim() : undefined;
    const body = payload?.body !== undefined ? String(payload.body || '').trim() : undefined;
    if (title !== undefined && !title)
        throw { status: 400, message: 'Title is required' };
    if (body !== undefined && !body)
        throw { status: 400, message: 'Body is required' };
    const publishAt = payload?.publishAt !== undefined ? toTimestamp(payload?.publishAt) : undefined;
    const expireAt = payload?.expireAt !== undefined ? toTimestamp(payload?.expireAt) : undefined;
    const type = payload?.type !== undefined ? normalizeType(payload?.type) : undefined;
    const status = payload?.status !== undefined ? normalizeStatus(payload?.status, publishAt || undefined) : undefined;
    const repeatInterval = payload?.repeatInterval !== undefined ? normalizeRepeat(payload?.repeatInterval) : undefined;
    const rows = await (0, db_1.query)(`UPDATE "Announcement"
     SET
      "title" = COALESCE($1, "title"),
      "body" = COALESCE($2, "body"),
      "type" = COALESCE($3, "type"),
      "status" = COALESCE($4, "status"),
      "repeatInterval" = COALESCE($5, "repeatInterval"),
      "publishAt" = CASE WHEN $6::timestamptz IS NULL THEN "publishAt" ELSE $6::timestamptz END,
      "expireAt" = CASE WHEN $7::timestamptz IS NULL THEN "expireAt" ELSE $7::timestamptz END,
      "updatedBy" = $8,
      "updatedAt" = NOW()
     WHERE "id" = $9
     RETURNING *`, [
        title ?? null,
        body ?? null,
        type ?? null,
        status ?? null,
        repeatInterval === undefined ? null : repeatInterval,
        publishAt === undefined ? null : publishAt ?? null,
        expireAt === undefined ? null : expireAt ?? null,
        userId ?? null,
        id,
    ]);
    if (!rows[0])
        throw { status: 404, message: 'Announcement not found' };
    return rows[0];
}
exports.updateAnnouncement = updateAnnouncement;
async function deleteAnnouncement(id) {
    await ensureAnnouncementsTable();
    await (0, db_1.query)(`DELETE FROM "Announcement" WHERE "id" = $1`, [id]);
    return { ok: true };
}
exports.deleteAnnouncement = deleteAnnouncement;
async function repostAnnouncement(id, userId) {
    await ensureAnnouncementsTable();
    const rows = await (0, db_1.query)(`UPDATE "Announcement"
     SET "status" = 'published',
         "publishAt" = NOW(),
         "updatedBy" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $1
     RETURNING *`, [id, userId ?? null]);
    if (!rows[0])
        throw { status: 404, message: 'Announcement not found' };
    return rows[0];
}
exports.repostAnnouncement = repostAnnouncement;
