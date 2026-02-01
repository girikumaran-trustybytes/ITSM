"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssetById = exports.getAssets = void 0;
const client_1 = __importDefault(require("./prisma/client"));
async function getAssets() {
    return client_1.default.asset.findMany({ orderBy: { createdAt: 'desc' } });
}
exports.getAssets = getAssets;
async function getAssetById(id) {
    return client_1.default.asset.findUnique({ where: { id: Number(id) } });
}
exports.getAssetById = getAssetById;
