export function validateCreate(payload: any) {
  if (!payload) return { ok: false, message: 'Missing body' }
  if (!payload.subject || typeof payload.subject !== 'string') return { ok: false, message: 'Missing subject' }
  if (!payload.type || typeof payload.type !== 'string') return { ok: false, message: 'Missing type' }
  return { ok: true }
}

export function validateTransition(body: any) {
  if (!body || !body.to) return { ok: false, message: 'Missing "to" state' }
  return { ok: true }
}