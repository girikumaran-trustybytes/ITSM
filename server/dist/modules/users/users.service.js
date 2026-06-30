"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveUserPresence = exports.getUserPresence = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUserById = exports.listUsers = exports.listUsersEmergency = exports.listUsersLightweight = void 0;
const db_1 = require("../../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const protected_admin_1 = require("./protected-admin");
function normalizeRole(input) {
    const value = String(input || 'USER').trim().toUpperCase();
    if (['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'].includes(value))
        return value;
    return 'USER';
}
function normalizePresenceStatus(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (raw === 'available' || raw === 'online' || raw === 'active')
        return 'Available';
    if (raw === 'do not disturb' || raw === 'dnd' || raw === 'busy')
        return 'Do not disturb';
    if (raw === 'set as away' || raw === 'away')
        return 'Set as away';
    return 'Available';
}
let userSchemaReady = null;
async function ensureUserCrudSchema() {
    if (!userSchemaReady) {
        userSchemaReady = (async () => {
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "workEmail" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employeeId" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "designation" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "department" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "reportingManager" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "dateOfJoining" DATE`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employmentType" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "workMode" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isEndUser" BOOLEAN DEFAULT FALSE`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN DEFAULT FALSE`);
            await (0, db_1.query)(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3)`);
            await (0, db_1.query)(`CREATE INDEX IF NOT EXISTS idx_user_employee_id ON "user"("employeeId")`);
            await (0, db_1.query)(`CREATE INDEX IF NOT EXISTS idx_user_work_email ON "user"("workEmail")`);
            await (0, db_1.query)(`CREATE INDEX IF NOT EXISTS idx_user_personal_email ON "user"("personalEmail")`);
            await (0, db_1.query)(`CREATE INDEX IF NOT EXISTS idx_user_is_end_user ON "user"("isEndUser")`);
            await (0, db_1.query)(`
        CREATE TABLE IF NOT EXISTS "serviceaccounts" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
          "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
          "autoUpgradeQueues" BOOLEAN NOT NULL DEFAULT TRUE,
          "queueIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await (0, db_1.query)(`CREATE UNIQUE INDEX IF NOT EXISTS idx_service_accounts_user_id ON "serviceaccounts"("userId")`);
            await (0, db_1.query)(`
        CREATE TABLE IF NOT EXISTS "userpresence" (
          "userId" INTEGER PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "status" TEXT NOT NULL DEFAULT 'Available',
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
            await (0, protected_admin_1.enforceProtectedAdminBaseline)();
            await (0, db_1.query)(`UPDATE "user" SET "isEndUser" = TRUE WHERE "role" = 'USER' AND COALESCE("isEndUser", FALSE) = FALSE`);
        })();
    }
    await userSchemaReady;
}
function normalizeQueueIds(input) {
    if (!Array.isArray(input))
        return [];
    return input
        .map((v) => String(v || '').trim())
        .filter((v) => v.length > 0);
}
function normalizePrincipalType(input) {
    const value = String(input || '').trim().toLowerCase();
    if (!value)
        return 'all';
    if (value === 'agent' || value === 'staff' || value === 'operator')
        return 'agent';
    if (value === 'all' || value === 'any')
        return 'all';
    return 'user';
}
async function syncServiceAccount(userId, enabled, opts = {}) {
    if (!enabled) {
        await (0, db_1.query)(`DELETE FROM "serviceaccounts" WHERE "userId" = $1`, [userId]);
        return;
    }
    const existing = await (0, db_1.queryOne)(`SELECT "autoUpgradeQueues", "queueIds" FROM "serviceaccounts" WHERE "userId" = $1`, [userId]);
    const autoUpgradeQueues = typeof opts.autoUpgradeQueues === 'boolean'
        ? opts.autoUpgradeQueues
        : (existing?.autoUpgradeQueues ?? true);
    const queueIds = Array.isArray(opts.queueIds)
        ? normalizeQueueIds(opts.queueIds)
        : (existing?.queueIds ?? []);
    await (0, db_1.query)(`INSERT INTO "serviceaccounts" ("userId", "enabled", "autoUpgradeQueues", "queueIds", "createdAt", "updatedAt")
     VALUES ($1, TRUE, $2, $3, NOW(), NOW())
     ON CONFLICT ("userId")
     DO UPDATE SET
       "enabled" = TRUE,
       "autoUpgradeQueues" = EXCLUDED."autoUpgradeQueues",
       "queueIds" = EXCLUDED."queueIds",
       "updatedAt" = NOW()`, [userId, autoUpgradeQueues, queueIds]);
}
function buildListScope(opts = {}, options = {}) {
    const useEndUserFlag = options.useEndUserFlag !== false;
    const userRoleCondition = useEndUserFlag
        ? `(u."role" = 'USER' OR COALESCE(u."isEndUser", FALSE) = TRUE)`
        : `u."role" = 'USER'`;
    const agentRoleCondition = `(u."role" <> 'USER' AND COALESCE(u."isEndUser", FALSE) = FALSE)`;
    const conditions = [];
    const params = [];
    const principalType = normalizePrincipalType(opts.principalType);
    if (principalType === 'user')
        conditions.push(userRoleCondition);
    if (principalType === 'agent')
        conditions.push(agentRoleCondition);
    if (opts.role) {
        const roles = String(opts.role)
            .split(/[,\|]/)
            .map((r) => r.trim())
            .filter(Boolean);
        if (roles.length === 1 && roles[0] === 'USER') {
            conditions.push(userRoleCondition);
        }
        else if (roles.length === 1) {
            params.push(roles[0]);
            conditions.push(`u."role" = $${params.length}`);
        }
        else if (roles.length > 1) {
            const includesUser = roles.includes('USER');
            if (includesUser) {
                const filtered = roles.filter((r) => r !== 'USER');
                if (filtered.length > 0) {
                    params.push(filtered);
                    conditions.push(`(u."role" = ANY($${params.length}) OR ${userRoleCondition})`);
                }
                else {
                    conditions.push(userRoleCondition);
                }
            }
            else {
                params.push(roles);
                conditions.push(`u."role" = ANY($${params.length})`);
            }
        }
    }
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`(u."name" ILIKE $${params.length} OR u."email" ILIKE $${params.length})`);
    }
    const take = opts.limit && opts.limit > 0 ? opts.limit : 50;
    params.push(take);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}
async function listUsersLightweight(opts = {}) {
    await ensureUserCrudSchema();
    const { where, params } = buildListScope(opts);
    return (0, db_1.query)(`SELECT
       u."id",
       u."name",
       u."avatarUrl",
       u."email",
       u."personalEmail",
       u."workEmail",
       u."phone",
       u."employeeId",
       u."designation",
       u."department",
       u."reportingManager",
       u."dateOfJoining",
       u."employmentType",
       u."workMode",
       u."role",
       COALESCE(u."isEndUser", FALSE) AS "isEndUser",
       COALESCE(u."mfaEnabled", FALSE) AS "mfaEnabled",
       u."status",
       COALESCE(up."status", 'Available') AS "presenceStatus",
       u."createdAt",
       COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
       COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
       COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds",
       CASE
         WHEN (u."role" = 'USER' OR COALESCE(u."isEndUser", FALSE) = TRUE) THEN 'USER'
         ELSE 'AGENT'
       END AS "principalType",
       'none'::text AS "inviteStatus"
     FROM "user" u
     LEFT JOIN "serviceaccounts" sa ON sa."userId" = u."id"
     LEFT JOIN "userpresence" up ON up."userId" = u."id"
     ${where}
     ORDER BY u."name" ASC NULLS LAST, u."email" ASC
     LIMIT $${params.length}`, params);
}
exports.listUsersLightweight = listUsersLightweight;
async function listUsersEmergency(opts = {}) {
    const { where, params } = buildListScope(opts, { useEndUserFlag: false });
    return (0, db_1.query)(`SELECT
       u."id",
       u."name",
       NULL::text AS "avatarUrl",
       u."email",
       NULL::text AS "personalEmail",
       NULL::text AS "workEmail",
       NULL::text AS "phone",
       NULL::text AS "employeeId",
       NULL::text AS "designation",
       NULL::text AS "department",
       NULL::text AS "reportingManager",
       NULL::date AS "dateOfJoining",
       NULL::text AS "employmentType",
       NULL::text AS "workMode",
       u."role",
       COALESCE(u."isEndUser", FALSE) AS "isEndUser",
       FALSE AS "mfaEnabled",
       COALESCE(u."status", 'INVITED') AS "status",
       'Available'::text AS "presenceStatus",
       u."createdAt",
       FALSE AS "isServiceAccount",
       TRUE AS "autoUpgradeQueues",
       ARRAY[]::TEXT[] AS "queueIds",
       CASE
         WHEN (u."role" = 'USER' OR COALESCE(u."isEndUser", FALSE) = TRUE) THEN 'USER'
         ELSE 'AGENT'
       END AS "principalType",
       'none'::text AS "inviteStatus"
     FROM "user" u
     ${where}
     ORDER BY u."name" ASC NULLS LAST, u."email" ASC
     LIMIT $${params.length}`, params);
}
exports.listUsersEmergency = listUsersEmergency;
async function listUsers(opts = {}) {
    await ensureUserCrudSchema();
    const { where, params } = buildListScope(opts);
    const inviteTables = await (0, db_1.queryOne)(`SELECT to_regclass('public.invitations')::text AS modern_exists`);
    const hasModernInvites = Boolean(inviteTables?.modern_exists);
    if (hasModernInvites) {
        return (0, db_1.query)(`SELECT
         u."id",
         u."name",
         u."avatarUrl",
         u."email",
         u."personalEmail",
         u."workEmail",
         u."phone",
         u."employeeId",
         u."designation",
         u."department",
         u."reportingManager",
         u."dateOfJoining",
         u."employmentType",
         u."workMode",
         u."role",
         COALESCE(u."isEndUser", FALSE) AS "isEndUser",
         COALESCE(u."mfaEnabled", FALSE) AS "mfaEnabled",
         u."status",
         COALESCE(up."status", 'Available') AS "presenceStatus",
         u."createdAt",
         COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
         COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
         COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds",
         CASE
           WHEN (u."role" = 'USER' OR COALESCE(u."isEndUser", FALSE) = TRUE) THEN 'USER'
           ELSE 'AGENT'
         END AS "principalType",
         COALESCE(
           CASE
             WHEN i.status = 'PENDING' AND i.last_sent_at IS NULL THEN 'invite_pending'
             WHEN i.status = 'PENDING' THEN 'invited_not_accepted'
             WHEN i.status = 'ACCEPTED' THEN 'accepted'
             WHEN i.status = 'EXPIRED' THEN 'expired'
             WHEN i.status = 'REVOKED' THEN 'revoked'
             ELSE LOWER(i.status)
           END,
           'none'
         ) AS "inviteStatus"
       FROM "user" u
       LEFT JOIN "serviceaccounts" sa ON sa."userId" = u."id"
       LEFT JOIN "userpresence" up ON up."userId" = u."id"
       LEFT JOIN LATERAL (
         SELECT status, last_sent_at
         FROM invitations
         WHERE user_id = u."id"
            OR LOWER(email) = LOWER(u."email")
         ORDER BY created_at DESC
         LIMIT 1
       ) i ON TRUE
       ${where}
       ORDER BY u."name" ASC NULLS LAST, u."email" ASC
       LIMIT $${params.length}`, params);
    }
    return listUsersLightweight(opts);
}
exports.listUsers = listUsers;
async function getUserById(id) {
    await ensureUserCrudSchema();
    return (0, db_1.queryOne)(`SELECT
      u."id",
      u."name",
      u."avatarUrl",
      u."email",
      u."role",
      COALESCE(u."isEndUser", FALSE) AS "isEndUser",
      COALESCE(u."mfaEnabled", FALSE) AS "mfaEnabled",
      u."phone",
      u."client",
      u."site",
      u."accountManager",
      u."personalEmail",
      u."workEmail",
      u."employeeId",
      u."designation",
      u."department",
      u."reportingManager",
      u."dateOfJoining",
      u."employmentType",
      u."workMode",
      u."status",
      u."lastLogin",
      COALESCE(up."status", 'Available') AS "presenceStatus",
      CASE
        WHEN (u."role" = 'USER' OR COALESCE(u."isEndUser", FALSE) = TRUE) THEN 'USER'
        ELSE 'AGENT'
      END AS "principalType",
      u."createdAt",
      u."updatedAt",
      COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
      COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
      COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds"
    FROM "user" u
    LEFT JOIN "serviceaccounts" sa ON sa."userId" = u."id"
    LEFT JOIN "userpresence" up ON up."userId" = u."id"
    WHERE u."id" = $1`, [id]);
}
exports.getUserById = getUserById;
async function createUser(payload) {
    await ensureUserCrudSchema();
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email)
        throw { status: 400, message: 'Email is required' };
    const requestedRole = normalizeRole(payload.role);
    let password = String(payload.password || '');
    if (password && password.length < 6)
        throw { status: 400, message: 'Password must be at least 6 characters' };
    if (!password) {
        password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    }
    const existing = await (0, db_1.queryOne)(`SELECT "id", "role", COALESCE("isEndUser", FALSE) AS "isEndUser"
     FROM "user"
     WHERE LOWER("email") = LOWER($1) OR LOWER("workEmail") = LOWER($1)`, [email]);
    if (existing) {
        const role = String(existing.role || '').toUpperCase();
        if (requestedRole === 'USER' && role !== 'USER' && !existing.isEndUser) {
            const nextName = payload.name ?? null;
            const nextPhone = payload.phone ?? null;
            const nextWorkEmail = payload.workEmail ?? null;
            const nextEmployeeId = payload.employeeId ?? null;
            const nextDesignation = payload.designation ?? null;
            const nextDepartment = payload.department ?? null;
            const nextReportingManager = payload.reportingManager ?? null;
            const nextDateOfJoining = payload.dateOfJoining ?? null;
            const nextEmploymentType = payload.employmentType ?? null;
            const nextWorkMode = payload.workMode ?? null;
            await (0, db_1.query)(`UPDATE "user"
         SET
           "isEndUser" = TRUE,
           "name" = COALESCE($2, "name"),
           "phone" = COALESCE($3, "phone"),
           "workEmail" = COALESCE($4, "workEmail"),
           "employeeId" = COALESCE($5, "employeeId"),
           "designation" = COALESCE($6, "designation"),
           "department" = COALESCE($7, "department"),
           "reportingManager" = COALESCE($8, "reportingManager"),
           "dateOfJoining" = COALESCE($9, "dateOfJoining"),
           "employmentType" = COALESCE($10, "employmentType"),
           "workMode" = COALESCE($11, "workMode"),
           "updatedAt" = NOW()
         WHERE "id" = $1`, [
                existing.id,
                nextName,
                nextPhone,
                nextWorkEmail,
                nextEmployeeId,
                nextDesignation,
                nextDepartment,
                nextReportingManager,
                nextDateOfJoining,
                nextEmploymentType,
                nextWorkMode,
            ]);
            return getUserById(Number(existing.id));
        }
        throw { status: 409, message: 'Email already exists' };
    }
    const hashed = await bcrypt_1.default.hash(password, 12);
    const data = {
        email,
        password: hashed,
        name: payload.name ?? null,
        avatarUrl: payload.avatarUrl ?? null,
        phone: payload.phone ?? null,
        personalEmail: payload.personalEmail ?? null,
        workEmail: payload.workEmail ?? null,
        employeeId: payload.employeeId ?? null,
        designation: payload.designation ?? null,
        department: payload.department ?? null,
        reportingManager: payload.reportingManager ?? null,
        dateOfJoining: payload.dateOfJoining ?? null,
        employmentType: payload.employmentType ?? null,
        workMode: payload.workMode ?? null,
        client: payload.client ?? null,
        site: payload.site ?? null,
        accountManager: payload.accountManager ?? null,
        role: requestedRole,
        isEndUser: requestedRole === 'USER',
        status: 'INVITED',
    };
    const protectedAdmin = (0, protected_admin_1.isProtectedAdminEmail)(email);
    const explicitServiceAccount = payload.isServiceAccount === true || payload.isServiceAccount === false
        ? Boolean(payload.isServiceAccount)
        : null;
    const shouldEnableServiceAccount = protectedAdmin
        ? false
        : explicitServiceAccount !== null
            ? explicitServiceAccount
            : data.role === 'AGENT';
    if (protectedAdmin) {
        data.role = 'ADMIN';
        data.status = 'ACTIVE';
    }
    if (shouldEnableServiceAccount)
        data.role = 'AGENT';
    data.isEndUser = data.role === 'USER';
    try {
        const rows = await (0, db_1.query)(`INSERT INTO "user" (
        "email", "password", "name", "avatarUrl", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department",
        "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "role", "isEndUser", "status", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
      )
      RETURNING "id", "name", "avatarUrl", "email", "role", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department", "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "isEndUser", "status", "createdAt", "updatedAt"`, [
            data.email, data.password, data.name, data.avatarUrl, data.phone, data.personalEmail, data.workEmail, data.employeeId, data.designation, data.department,
            data.reportingManager, data.dateOfJoining, data.employmentType, data.workMode, data.client, data.site, data.accountManager, data.role, data.isEndUser, data.status,
        ]);
        const created = rows[0];
        await syncServiceAccount(Number(created.id), shouldEnableServiceAccount, {
            autoUpgradeQueues: payload.autoUpgradeQueues,
            queueIds: payload.queueIds,
        });
        await (0, protected_admin_1.enforceProtectedAdminRoleByUserId)(Number(created.id));
        return getUserById(Number(created.id));
    }
    catch (err) {
        if (err?.code === '23505')
            throw { status: 409, message: 'Email already exists' };
        throw err;
    }
}
exports.createUser = createUser;
async function updateUser(id, payload) {
    await ensureUserCrudSchema();
    const currentUser = await (0, db_1.queryOne)('SELECT "id", "role", "email", "status" FROM "user" WHERE "id" = $1', [id]);
    if (!currentUser)
        throw { status: 404, message: 'User not found' };
    const protectedAdmin = (0, protected_admin_1.isProtectedAdminEmail)(currentUser.email);
    const data = {};
    if (payload.email !== undefined)
        data.email = String(payload.email).trim().toLowerCase();
    if (payload.name !== undefined)
        data.name = payload.name;
    if (payload.avatarUrl !== undefined)
        data.avatarUrl = payload.avatarUrl;
    if (payload.phone !== undefined)
        data.phone = payload.phone;
    if (payload.personalEmail !== undefined)
        data.personalEmail = payload.personalEmail;
    if (payload.workEmail !== undefined)
        data.workEmail = payload.workEmail;
    if (payload.employeeId !== undefined)
        data.employeeId = payload.employeeId;
    if (payload.designation !== undefined)
        data.designation = payload.designation;
    if (payload.department !== undefined)
        data.department = payload.department;
    if (payload.reportingManager !== undefined)
        data.reportingManager = payload.reportingManager;
    if (payload.dateOfJoining !== undefined)
        data.dateOfJoining = payload.dateOfJoining;
    if (payload.employmentType !== undefined)
        data.employmentType = payload.employmentType;
    if (payload.workMode !== undefined)
        data.workMode = payload.workMode;
    if (payload.client !== undefined)
        data.client = payload.client;
    if (payload.site !== undefined)
        data.site = payload.site;
    if (payload.accountManager !== undefined)
        data.accountManager = payload.accountManager;
    if (payload.role !== undefined)
        data.role = normalizeRole(payload.role);
    if (payload.mfaEnabled !== undefined)
        data.mfaEnabled = Boolean(payload.mfaEnabled);
    const candidateEmails = [data.email, data.workEmail]
        .map((value) => (value === undefined || value === null ? '' : String(value).trim().toLowerCase()))
        .filter((value) => value.length > 0);
    if (candidateEmails.length > 0) {
        for (const candidate of candidateEmails) {
            const conflict = await (0, db_1.queryOne)(`SELECT "id" FROM "user"
         WHERE "id" <> $2
           AND (LOWER("email") = LOWER($1) OR LOWER("workEmail") = LOWER($1))`, [candidate, id]);
            if (conflict)
                throw { status: 409, message: 'Email already exists' };
        }
    }
    if (payload.status !== undefined)
        data.status = String(payload.status).trim().toUpperCase();
    const explicitServiceAccount = payload.isServiceAccount === true || payload.isServiceAccount === false
        ? Boolean(payload.isServiceAccount)
        : null;
    if (explicitServiceAccount === true)
        data.role = 'AGENT';
    if (explicitServiceAccount === false && payload.role === undefined && String(currentUser.role || '').toUpperCase() === 'AGENT') {
        data.role = 'USER';
    }
    if (data.role !== undefined) {
        data.isEndUser = String(data.role || '').trim().toUpperCase() === 'USER';
    }
    if (payload.password) {
        if (String(payload.password).length < 6)
            throw { status: 400, message: 'Password must be at least 6 characters' };
        data.password = await bcrypt_1.default.hash(String(payload.password), 12);
    }
    if (protectedAdmin) {
        const requestedEmail = payload.email !== undefined
            ? String(payload.email || '').trim().toLowerCase()
            : String(currentUser.email || '').trim().toLowerCase();
        if (requestedEmail !== String(currentUser.email || '').trim().toLowerCase()) {
            throw { status: 403, message: 'Protected admin email cannot be changed.' };
        }
        const requestedStatus = payload.status !== undefined
            ? String(payload.status || '').trim().toUpperCase()
            : String(currentUser.status || '').trim().toUpperCase();
        if (requestedStatus && requestedStatus !== 'ACTIVE') {
            throw { status: 403, message: 'Protected admin cannot be deactivated.' };
        }
        data.role = 'ADMIN';
        data.status = 'ACTIVE';
        data.isEndUser = false;
    }
    try {
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(data)) {
            params.push(value);
            setParts.push(`"${key}" = $${params.length}`);
        }
        setParts.push('"updatedAt" = NOW()');
        params.push(id);
        const rows = await (0, db_1.query)(`UPDATE "user" SET ${setParts.join(', ')} WHERE "id" = $${params.length}
       RETURNING "id", "name", "avatarUrl", "email", "role", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department", "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "status", "createdAt", "updatedAt"`, params);
        if (!rows[0])
            throw { status: 404, message: 'User not found' };
        const shouldSyncServiceAccount = (explicitServiceAccount !== null && !protectedAdmin) ||
            payload.role !== undefined ||
            payload.autoUpgradeQueues !== undefined ||
            payload.queueIds !== undefined;
        if (shouldSyncServiceAccount) {
            const nextRole = String(rows[0]?.role || currentUser.role || '').toUpperCase();
            const enabled = protectedAdmin ? false : (explicitServiceAccount !== null ? explicitServiceAccount : nextRole === 'AGENT');
            await syncServiceAccount(id, enabled, {
                autoUpgradeQueues: payload.autoUpgradeQueues,
                queueIds: payload.queueIds,
            });
        }
        await (0, protected_admin_1.enforceProtectedAdminRoleByUserId)(id);
        return getUserById(id);
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        if (err?.code === '23505')
            throw { status: 409, message: 'Email already exists' };
        throw err;
    }
}
exports.updateUser = updateUser;
async function deleteUser(id) {
    await ensureUserCrudSchema();
    try {
        const deleting = await (0, db_1.queryOne)(`SELECT u."email", u."role", u."status", COALESCE(sa."enabled", FALSE) AS "isServiceAccount"
       FROM "user" u
       LEFT JOIN "serviceaccounts" sa ON sa."userId" = u."id"
       WHERE u."id" = $1`, [id]);
        if (!deleting)
            throw { status: 404, message: 'User not found' };
        if ((0, protected_admin_1.isProtectedAdminEmail)(deleting?.email || '')) {
            throw { status: 403, message: 'Protected admin user cannot be deleted.' };
        }
        const role = String(deleting.role || '').trim().toUpperCase();
        const status = String(deleting.status || '').trim().toUpperCase();
        const isDeactivatedAccount = (role === 'USER' && !Boolean(deleting.isServiceAccount)) ||
            ['DEACTIVATED', 'DISABLED', 'INACTIVE'].includes(status);
        if (!isDeactivatedAccount) {
            throw { status: 409, message: 'Only deactivated accounts can be deleted.' };
        }
        // RefreshToken uses ON DELETE RESTRICT in init schema, so clear tokens before deleting user.
        await (0, db_1.query)('DELETE FROM "refreshtoken" WHERE "userId" = $1', [id]);
        await (0, db_1.query)('DELETE FROM "serviceaccounts" WHERE "userId" = $1', [id]);
        const rows = await (0, db_1.query)('DELETE FROM "user" WHERE "id" = $1 RETURNING "id", "name", "email"', [id]);
        if (!rows[0])
            throw { status: 404, message: 'User not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        if (err?.code === '23503') {
            throw { status: 409, message: 'Cannot delete user because related records still exist.' };
        }
        throw err;
    }
}
exports.deleteUser = deleteUser;
async function getUserPresence(userId) {
    await ensureUserCrudSchema();
    const user = await (0, db_1.queryOne)('SELECT "id" FROM "user" WHERE "id" = $1', [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const row = await (0, db_1.queryOne)('SELECT "status" FROM "userpresence" WHERE "userId" = $1', [userId]);
    return { status: normalizePresenceStatus(row?.status) };
}
exports.getUserPresence = getUserPresence;
async function saveUserPresence(userId, statusInput) {
    await ensureUserCrudSchema();
    const user = await (0, db_1.queryOne)('SELECT "id" FROM "user" WHERE "id" = $1', [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const status = normalizePresenceStatus(statusInput);
    await (0, db_1.query)(`INSERT INTO "userpresence" ("userId", "status", "updatedAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("userId")
     DO UPDATE SET "status" = EXCLUDED."status", "updatedAt" = NOW()`, [userId, status]);
    return { status };
}
exports.saveUserPresence = saveUserPresence;
