import { query } from '../db'

const intervalMs = Number(process.env.SLA_JOB_INTERVAL_MS || 60000)

async function runSlaSweep() {
  try {
    await query(
      `UPDATE "SlaTracking"
       SET "status" = 'breached', "updatedAt" = NOW()
       WHERE COALESCE("resolvedAt", NULL) IS NULL
         AND "resolutionTargetAt" IS NOT NULL
         AND "resolutionTargetAt" < NOW()
         AND "status" <> 'breached'`
    )
  } catch (err: any) {
    console.warn('[WARN] SLA sweep failed', err?.message || err)
  }
}

setInterval(runSlaSweep, intervalMs)
runSlaSweep().catch(() => undefined)
console.log(`[INFO] SLA job initialized (interval ${intervalMs}ms)`)
