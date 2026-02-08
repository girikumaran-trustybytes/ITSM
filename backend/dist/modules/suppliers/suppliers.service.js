"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplier = exports.listSuppliers = exports.getSupplier = exports.updateSupplier = exports.createSupplier = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
const createSupplier = async (data) => {
    return client_1.default.supplier.create({ data });
};
exports.createSupplier = createSupplier;
const updateSupplier = async (id, data) => {
    return client_1.default.supplier.update({ where: { id }, data });
};
exports.updateSupplier = updateSupplier;
const getSupplier = async (id) => {
    return client_1.default.supplier.findUnique({ where: { id } });
};
exports.getSupplier = getSupplier;
const listSuppliers = async (opts = {}) => {
    const where = {};
    if (opts.q) {
        where.OR = [
            { companyName: { contains: opts.q, mode: 'insensitive' } },
            { contactName: { contains: opts.q, mode: 'insensitive' } },
            { contactEmail: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    return client_1.default.supplier.findMany({ where, orderBy: { companyName: 'asc' } });
};
exports.listSuppliers = listSuppliers;
const deleteSupplier = async (id) => {
    return client_1.default.supplier.delete({ where: { id } });
};
exports.deleteSupplier = deleteSupplier;
