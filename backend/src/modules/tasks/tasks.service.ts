import { query } from '../../db'

export async function createTask(ticketId: number, name: string, assignedToId?: number) {
  const rows = await query(
    'INSERT INTO "Task" ("ticketId", "name", "assignedToId", "createdAt") VALUES ($1, $2, $3, NOW()) RETURNING *',
    [ticketId, name, assignedToId || null]
  )
  return rows[0]
}

export async function listTasksByTicket(ticketId: number) {
  return query('SELECT * FROM "Task" WHERE "ticketId" = $1', [ticketId])
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
