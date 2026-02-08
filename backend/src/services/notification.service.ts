import fs from 'fs'
import path from 'path'

const templatesDir = path.join(__dirname, '../../services/notifications/templates')

export async function renderTemplate(kind: 'email'|'teams', name: string, data: Record<string, any>) {
  const file = path.join(templatesDir, kind, name)
  const t = await fs.promises.readFile(file, 'utf-8')
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => data[k] ?? '')
}

export async function sendEmail(to: string, subject: string, templateName: string, data: Record<string, any>) {
  const body = await renderTemplate('email', templateName, data)
  console.log('[Notification] sendEmail', { to, subject, body: body.slice(0,200) })
  return Promise.resolve(true)
}

export async function sendTeamsWebhook(webhookUrl: string, templateName: string, data: Record<string, any>) {
  const payload = await renderTemplate('teams', templateName, data)
  console.log('[Notification] sendTeamsWebhook', { webhookUrl, payload: payload.slice(0,200) })
  return Promise.resolve(true)
}
