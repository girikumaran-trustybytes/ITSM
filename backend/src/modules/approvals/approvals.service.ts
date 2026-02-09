import { query } from '../../db'

export async function createApproval(ticketId: number, approverId?: number) {
  const rows = await query(
    'INSERT INTO "Approval" ("ticketId", "approverId", "createdAt") VALUES ($1, $2, NOW()) RETURNING *',
    [ticketId, approverId || null]
  )
  return rows[0]
}

export async function listApprovalsByTicket(ticketId: number) {
  return query('SELECT * FROM "Approval" WHERE "ticketId" = $1', [ticketId])
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
    `UPDATE "Approval" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
    params
  )
  return rows[0] ?? null
}
