"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./common/middleware/error.middleware");
const rbac_service_1 = require("./modules/users/rbac.service");
const auth_service_1 = require("./modules/auth/auth.service");
const app = (0, express_1.default)();
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
];
function toOptionalOrigin(value) {
    const origin = String(value || '').trim();
    return origin ? origin : '';
}
function splitCsv(value) {
    return String(value || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}
const productionFallbackOriginList = [
    toOptionalOrigin(process.env.FRONTEND_URL),
    toOptionalOrigin(process.env.APP_URL),
    toOptionalOrigin(process.env.WEB_APP_URL),
]
    .filter(Boolean);
const previewOriginPatterns = splitCsv(String(process.env.PREVIEW_ORIGIN_PATTERNS || ''));
const defaultOriginPatterns = isProduction
    ? productionFallbackOriginList
    : defaultDevOrigins;
const allowedOriginPatterns = Array.from(new Set([
    ...defaultOriginPatterns,
    ...previewOriginPatterns,
]));
if (isProduction && allowedOriginPatterns.length === 0) {
    throw new Error('Set FRONTEND_URL, APP_URL, WEB_APP_URL, or PREVIEW_ORIGIN_PATTERNS in production');
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isAllowedOrigin(origin) {
    const normalized = String(origin || '').trim().toLowerCase();
    if (!normalized)
        return false;
    return allowedOriginPatterns.some((pattern) => {
        const normalizedPattern = String(pattern || '').trim().toLowerCase();
        if (!normalizedPattern)
            return false;
        if (normalizedPattern === normalized)
            return true;
        if (!normalizedPattern.includes('*'))
            return false;
        const matcher = new RegExp(`^${normalizedPattern.split('*').map(escapeRegExp).join('.*')}$`);
        return matcher.test(normalized);
    });
}
void (0, rbac_service_1.ensureRbacSeeded)().catch((error) => {
    // Keep API boot resilient; authorization middleware still has safe fallbacks.
    console.error('RBAC seed initialization failed:', error);
});
void (0, auth_service_1.warmupAuthSchema)().catch((error) => {
    // Warm-up is best effort; auth handlers still retry on demand.
    console.error('Auth schema warm-up failed:', error);
});
if (isProduction)
    app.set('trust proxy', 1);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow non-browser tools and same-origin calls with no Origin header.
        if (!origin)
            return callback(null, true);
        if (isAllowedOrigin(origin))
            return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));
app.use(express_1.default.json({
    limit: '50mb',
    verify: (req, _res, buffer) => {
        req.rawBody = buffer.length ? buffer.toString('utf8') : '';
    },
}));
app.use((0, morgan_1.default)(isProduction ? 'combined' : 'dev'));
// Normalize incoming requests that accidentally include a duplicate `/api` prefix
// e.g. `/api/api/auth/login` -> `/api/auth/login`
app.use((req, _res, next) => {
    if (req.url.startsWith('/api/api/')) {
        req.url = req.url.replace('/api/api/', '/api/');
    }
    else if (req.url === '/api/api') {
        req.url = '/api';
    }
    // Backward-compatible auth alias when callers omit the `/api` prefix.
    // e.g. `/auth/login` -> `/api/auth/login`
    if (req.url === '/auth' || req.url.startsWith('/auth/')) {
        req.url = `/api${req.url}`;
    }
    next();
});
// API routes
app.use('/api', routes_1.default);
// health
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// error handler (always last)
app.use(error_middleware_1.errorHandler);
exports.default = app;
