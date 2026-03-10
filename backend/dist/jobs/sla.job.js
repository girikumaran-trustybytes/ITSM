"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const intervalMs = Number(process.env.SLA_JOB_INTERVAL_MS || 60000);
async function runSlaSweep() {
    try {
        await (0, db_1.query)(`UPDATE "SlaTracking"
       SET "status" = 'breached', "updatedAt" = NOW()
       WHERE COALESCE("resolvedAt", NULL) IS NULL
         AND "resolutionTargetAt" IS NOT NULL
         AND "resolutionTargetAt" < NOW()
         AND "status" <> 'breached'`);
    }
    catch (err) {
        console.warn('[WARN] SLA sweep failed', err?.message || err);
    }
}
setInterval(runSlaSweep, intervalMs);
runSlaSweep().catch(() => undefined);
console.log(`[INFO] SLA job initialized (interval ${intervalMs}ms)`);
