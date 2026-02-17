import { query, queryOne } from '../../db'

async function resolveTicketDbId(ticketRef: string | number): Promise<number> {
  const raw = String(ticketRef || '').trim()
  if (!raw) throw { status: 400, message: 'ticketId is required' }
  if (/^\d+$/.test(raw)) {
    const row = await queryOne<{ id: number }>('SELECT "id" FROM "Ticket" WHERE "id" = $1', [Number(raw)])
    if (!row?.id) throw { status: 404, message: 'Ticket not found' }
    return row.id
  }
  const row = await queryOne<{ id: number }>('SELECT "id" FROM "Ticket" WHERE "ticketId" = $1', [raw])
  if (!row?.id) throw { status: 404, message: 'Ticket not found' }
  return row.id
}

export async function createTask(ticketId: string | number, name: string, assignedToId?: number) {
  const ticketDbId = await resolveTicketDbId(ticketId)
  const rows = await query(
    'INSERT INTO "Task" ("ticketId", "name", "assignedToId", "createdAt") VALUES ($1, $2, $3, NOW()) RETURNING *',
    [ticketDbId, name, assignedToId || null]
  )
  return rows[0]
}

export async function listTasksByTicket(ticketId: string | number) {
  const ticketDbId = await resolveTicketDbId(ticketId)
  return query('SELECT * FROM "Task" WHERE "ticketId" = $1', [ticketDbId])
}

export async function updateTaskStatus(taskId: number, status: string) {
  const setParts: string[] = ['"status" = $1']
  const params: any[] = [status]
  if (status === 'completed') {
    setParts.push('"completedAt" = NOW()')
  }
  params.push(taskId)
  const rows = await query(
    `UPDATE "Task" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
    params
  )
  return rows[0] ?? null
}
