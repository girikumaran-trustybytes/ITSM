"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_1 = require("../../data");
const auth_middleware_1 = require("../../common/middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateJWT);
router.get('/', async (_req, res) => {
    const assets = await (0, data_1.getAssets)();
    res.json(assets);
});
router.get('/:id', async (req, res) => {
    const asset = await (0, data_1.getAssetById)(req.params.id);
    if (asset) {
        res.json(asset);
    }
    else {
        res.status(404).json({ error: 'Asset not found' });
    }
});
exports.default = router;
