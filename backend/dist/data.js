"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssetById = exports.getAssets = void 0;
const db_1 = require("./db");
async function getAssets() {
    return (0, db_1.query)('SELECT * FROM "Asset" ORDER BY "createdAt" DESC');
}
exports.getAssets = getAssets;
async function getAssetById(id) {
    return (0, db_1.queryOne)('SELECT * FROM "Asset" WHERE "id" = $1', [Number(id)]);
}
exports.getAssetById = getAssetById;
