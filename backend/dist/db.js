"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withClient = exports.queryOne = exports.query = void 0;
const pg_1 = require("pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    // Avoid hard failure at import time; server will surface error on first query.
    // This keeps behavior closer to previous Prisma init when env was missing.
    console.warn('DATABASE_URL is not set');
}
const pool = new pg_1.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000),
});
pool.on('error', (err) => {
    console.error('Unexpected pg pool error', err);
});
async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}
exports.query = query;
async function queryOne(text, params = []) {
    const rows = await query(text, params);
    return rows[0] ?? null;
}
exports.queryOne = queryOne;
async function withClient(fn) {
    const client = await pool.connect();
    try {
        return await fn(client);
    }
    finally {
        client.release();
    }
}
exports.withClient = withClient;
exports.default = pool;
