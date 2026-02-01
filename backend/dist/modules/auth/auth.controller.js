"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.login = void 0;
const authService = __importStar(require("./auth.service"));
async function login(req, res) {
    const { email, password } = req.body;
    try {
        const result = await authService.login(email, password);
        res.json(result);
    }
    catch (err) {
        res.status(401).json({ error: err.message || 'Unauthorized' });
    }
}
exports.login = login;
async function refresh(req, res) {
    const { refreshToken } = req.body;
    try {
        const result = await authService.refresh(refreshToken);
        res.json(result);
    }
    catch (err) {
        res.status(401).json({ error: err.message || 'Unauthorized' });
    }
}
exports.refresh = refresh;
