"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zDateLike = exports.zMaybeBoolean = exports.zMaybeNumber = exports.zMaybeString = exports.zPageSize = exports.zPage = exports.zId = void 0;
const zod_1 = require("zod");
exports.zId = zod_1.z.coerce.number().int().positive();
exports.zPage = zod_1.z.coerce.number().int().positive().default(1);
exports.zPageSize = zod_1.z.coerce.number().int().positive().default(20);
exports.zMaybeString = zod_1.z.string().trim().min(1).optional();
exports.zMaybeNumber = zod_1.z.coerce.number().optional();
exports.zMaybeBoolean = zod_1.z.preprocess((val) => {
    if (val === 'true')
        return true;
    if (val === 'false')
        return false;
    return val;
}, zod_1.z.boolean().optional());
exports.zDateLike = zod_1.z.preprocess((val) => {
    if (val === '' || val === null || val === undefined)
        return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime()))
        return null;
    return d;
}, zod_1.z.date().nullable());
