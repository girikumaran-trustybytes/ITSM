"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TICKETS_INITIAL = void 0;
// Simple seed (kept minimal and compatible with frontend demo values)
exports.TICKETS_INITIAL = [
    {
        id: '#002994',
        subject: 'PC stuck on Windows loading screen',
        type: 'Incident',
        status: 'New',
        priority: 'High',
        category: 'Hardware>Desktop',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaDue: null,
        comments: []
    }
];
