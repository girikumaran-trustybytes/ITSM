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
const app = (0, express_1.default)();
const allowedOrigins = String(process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
void (0, rbac_service_1.ensureRbacSeeded)().catch((error) => {
    // Keep API boot resilient; authorization middleware still has safe fallbacks.
    console.error('RBAC seed initialization failed:', error);
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow non-browser tools and same-origin calls with no Origin header.
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use((0, morgan_1.default)('dev'));
// Normalize incoming requests that accidentally include a duplicate `/api` prefix
// e.g. `/api/api/auth/login` -> `/api/auth/login`
app.use((req, _res, next) => {
    if (req.url.startsWith('/api/api/')) {
        req.url = req.url.replace('/api/api/', '/api/');
    }
    else if (req.url === '/api/api') {
        req.url = '/api';
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
