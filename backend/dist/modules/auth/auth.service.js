"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.login = void 0;
const db_1 = require("../../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
async function login(email, password) {
    const user = await (0, db_1.queryOne)('SELECT * FROM app_user WHERE email = $1', [email]);
    if (!user)
        throw new Error('Invalid credentials');
    const ok = await bcrypt_1.default.compare(password, user.password_hash);
    if (!ok)
        throw new Error('Invalid credentials');
    // Get user's role(s)
    const roleRows = await (0, db_1.query)('SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1', [user.user_id]);
    const roles = roleRows.map((r) => r.role_name);
    const primaryRole = roles.length > 0 ? roles[0] : 'USER';
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const accessToken = jsonwebtoken_1.default.sign({ sub: user.user_id, email: user.email, name: fullName, role: primaryRole }, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES,
    });
    const refreshToken = jsonwebtoken_1.default.sign({ sub: user.user_id }, REFRESH_SECRET, {
        expiresIn: `${REFRESH_EXPIRES_DAYS}d`,
    });
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await (0, db_1.query)('INSERT INTO refresh_token (token, user_id, expires_at) VALUES ($1, $2, $3)', [refreshToken, user.user_id, expiresAt]);
    return { accessToken, refreshToken, user: { id: user.user_id, email: user.email, name: fullName, role: primaryRole } };
}
exports.login = login;
async function refresh(refreshToken) {
    try {
        const payload = jsonwebtoken_1.default.verify(refreshToken, REFRESH_SECRET);
        const record = await (0, db_1.queryOne)('SELECT * FROM refresh_token WHERE token = $1', [refreshToken]);
        if (!record || record.revoked)
            throw new Error('Invalid refresh token');
        const user = await (0, db_1.queryOne)('SELECT * FROM app_user WHERE user_id = $1', [record.user_id]);
        if (!user)
            throw new Error('User not found');
        // Get user's role(s)
        const roleRows = await (0, db_1.query)('SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1', [user.user_id]);
        const roles = roleRows.map((r) => r.role_name);
        const primaryRole = roles.length > 0 ? roles[0] : 'USER';
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.user_id, email: user.email, name: fullName, role: primaryRole }, ACCESS_SECRET, {
            expiresIn: ACCESS_EXPIRES,
        });
        return { accessToken };
    }
    catch (err) {
        throw new Error('Invalid refresh token');
    }
}
exports.refresh = refresh;
