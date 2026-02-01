"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.login = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
async function login(email, password) {
    const user = await client_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw new Error('Invalid credentials');
    const ok = await bcrypt_1.default.compare(password, user.password);
    if (!ok)
        throw new Error('Invalid credentials');
    const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES,
    });
    const refreshToken = jsonwebtoken_1.default.sign({ sub: user.id }, REFRESH_SECRET, {
        expiresIn: `${REFRESH_EXPIRES_DAYS}d`,
    });
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await client_1.default.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt,
        },
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
}
exports.login = login;
async function refresh(refreshToken) {
    try {
        const payload = jsonwebtoken_1.default.verify(refreshToken, REFRESH_SECRET);
        const record = await client_1.default.refreshToken.findUnique({ where: { token: refreshToken } });
        if (!record || record.revoked)
            throw new Error('Invalid refresh token');
        const user = await client_1.default.user.findUnique({ where: { id: record.userId } });
        if (!user)
            throw new Error('User not found');
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, {
            expiresIn: ACCESS_EXPIRES,
        });
        return { accessToken };
    }
    catch (err) {
        throw new Error('Invalid refresh token');
    }
}
exports.refresh = refresh;
