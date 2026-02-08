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
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
// Normalize incoming requests that accidentally include a duplicate `/api` prefix
// e.g. `/api/api/auth/login` -> `/api/auth/login` and `/api/api/v1/tickets` -> `/api/v1/tickets`
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
