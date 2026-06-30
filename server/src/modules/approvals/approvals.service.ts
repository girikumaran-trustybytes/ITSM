import { query, queryOne } from '../../db'

async function resolveTicketDbId(ticketRef: string | number): Promise<number> {
  const raw = String(ticketRef || '').trim()
  if (!raw) throw { status: 400, message: 'ticketId is required' }
  if (/^\d+$/.test(raw)) {
    const row = await queryOne<{ id: number }>('SELECT "id" FROM "ticket" WHERE "id" = $1', [Number(raw)])
    if (!row?.id) throw { status: 404, message: 'Ticket not found' }
    return row.id
  }
  const row = await queryOne<{ id: number }>('SELECT "id" FROM "ticket" WHERE "ticketId" = $1', [raw])
  if (!row?.id) throw { status: 404, message: 'Ticket not found' }
  return row.id
}

export async function createApproval(ticketId: string | number, approverId?: number) {
  const ticketDbId = await resolveTicketDbId(ticketId)
  const rows = await query(
    'INSERT INTO "approval" ("ticketId", "approverId", "createdAt") VALUES ($1, $2, NOW()) RETURNING *',
    [ticketDbId, approverId || null]
  )
  return rows[0]
}

export async function listApprovalsByTicket(ticketId: string | number) {
  const ticketDbId = await resolveTicketDbId(ticketId)
  return query('SELECT * FROM "approval" WHERE "ticketId" = $1', [ticketDbId])
}

export async function setApprovalStatus(approvalId: number, status: string, approverId?: number, comment?: string) {
  const setParts: string[] = ['"status" = $1']
  const params: any[] = [status]
  if (approverId !== undefined) {
    params.push(approverId)
    setParts.push(`"approverId" = $${params.length}`)
  }
  if (comment !== undefined) {
    params.push(comment)
    setParts.push(`"comment" = $${params.length}`)
  }
  if (status === 'approved') {
    setParts.push('"approvedAt" = NOW()')
  }
  params.push(approvalId)
  const rows = await query(
    `UPDATE "approval" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
    params
  )
  return rows[0] ?? null
}

export async function getApprovalById(approvalId: number) {
  return queryOne<any>('SELECT * FROM "approval" WHERE "id" = $1', [approvalId])
}
