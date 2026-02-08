"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAssetServices = exports.setAssetProblems = exports.setAssetChanges = exports.linkTicketsToAsset = exports.deleteAsset = exports.updateAsset = exports.createAsset = exports.getAssetById = exports.listAssets = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function listAssets(opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const where = {};
    if (opts.q) {
        where.OR = [
            { assetId: { contains: opts.q, mode: 'insensitive' } },
            { name: { contains: opts.q, mode: 'insensitive' } },
            { serial: { contains: opts.q, mode: 'insensitive' } },
            { category: { contains: opts.q, mode: 'insensitive' } },
            { vendor: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    if (opts.status)
        where.status = opts.status;
    if (opts.category)
        where.category = opts.category;
    if (opts.assignedToId !== undefined)
        where.assignedToId = opts.assignedToId;
    const [items, total] = await Promise.all([
        client_1.default.asset.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { assignedTo: true, parentAsset: true },
        }),
        client_1.default.asset.count({ where }),
    ]);
    return { items, total, page, pageSize };
}
exports.listAssets = listAssets;
async function getAssetById(id) {
    return client_1.default.asset.findUnique({
        where: { id },
        include: {
            assignedTo: true,
            parentAsset: true,
            childAssets: true,
            tickets: true,
            assetChanges: { include: { change: true } },
            assetProblems: { include: { problem: true } },
            assetServices: { include: { service: true } },
        },
    });
}
exports.getAssetById = getAssetById;
async function createAsset(data) {
    return client_1.default.asset.create({ data });
}
exports.createAsset = createAsset;
async function updateAsset(id, data) {
    return client_1.default.asset.update({ where: { id }, data });
}
exports.updateAsset = updateAsset;
async function deleteAsset(id) {
    return client_1.default.asset.delete({ where: { id } });
}
exports.deleteAsset = deleteAsset;
async function linkTicketsToAsset(assetId, ticketIds) {
    await client_1.default.ticket.updateMany({ where: { assetId }, data: { assetId: null } });
    if (ticketIds.length === 0)
        return;
    const numericIds = ticketIds.map((t) => Number(t)).filter((n) => !Number.isNaN(n));
    await client_1.default.ticket.updateMany({
        where: {
            OR: [
                { ticketId: { in: ticketIds } },
                ...(numericIds.length ? [{ id: { in: numericIds } }] : []),
            ],
        },
        data: { assetId },
    });
}
exports.linkTicketsToAsset = linkTicketsToAsset;
async function setAssetChanges(assetId, changeIds) {
    await client_1.default.assetChange.deleteMany({ where: { assetId } });
    if (!changeIds.length)
        return;
    await client_1.default.assetChange.createMany({ data: changeIds.map((changeId) => ({ assetId, changeId })) });
}
exports.setAssetChanges = setAssetChanges;
async function setAssetProblems(assetId, problemIds) {
    await client_1.default.assetProblem.deleteMany({ where: { assetId } });
    if (!problemIds.length)
        return;
    await client_1.default.assetProblem.createMany({ data: problemIds.map((problemId) => ({ assetId, problemId })) });
}
exports.setAssetProblems = setAssetProblems;
async function setAssetServices(assetId, serviceIds) {
    await client_1.default.assetService.deleteMany({ where: { assetId } });
    if (!serviceIds.length)
        return;
    await client_1.default.assetService.createMany({ data: serviceIds.map((serviceId) => ({ assetId, serviceId })) });
}
exports.setAssetServices = setAssetServices;
