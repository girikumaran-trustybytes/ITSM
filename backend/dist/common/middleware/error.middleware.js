"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
function errorHandler(err, _req, res, _next) {
    console.error('Unhandled Error:', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
}
exports.errorHandler = errorHandler;
