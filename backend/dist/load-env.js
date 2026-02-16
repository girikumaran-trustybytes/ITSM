"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Prefer backend/.env when server is started from repo root.
// Fallback to cwd/.env when started inside backend/.
const candidatePaths = [
    path_1.default.resolve(process.cwd(), 'backend/.env'),
    path_1.default.resolve(process.cwd(), '.env'),
];
for (const envPath of candidatePaths) {
    if (fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath });
        break;
    }
}
