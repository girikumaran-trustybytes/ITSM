"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
function validate(schemas) {
    return (req, res, next) => {
        try {
            const parsed = {};
            if (schemas.params) {
                const result = schemas.params.safeParse(req.params);
                if (!result.success)
                    return res.status(400).json({ error: result.error.flatten() });
                parsed.params = result.data;
                req.params = result.data;
            }
            if (schemas.query) {
                const result = schemas.query.safeParse(req.query);
                if (!result.success)
                    return res.status(400).json({ error: result.error.flatten() });
                parsed.query = result.data;
                req.query = result.data;
            }
            if (schemas.body) {
                const result = schemas.body.safeParse(req.body);
                if (!result.success)
                    return res.status(400).json({ error: result.error.flatten() });
                parsed.body = result.data;
                req.body = result.data;
            }
            ;
            req.validated = parsed;
            return next();
        }
        catch (err) {
            return res.status(500).json({ error: err.message || 'Validation failed' });
        }
    };
}
exports.validate = validate;
exports.default = validate;
