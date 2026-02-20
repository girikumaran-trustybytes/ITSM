import api from './api'

export type MailProvider = 'gmail' | 'google-workspace' | 'zoho' | 'microsoft-workspace' | 'outlook' | 'custom'

export async function getMailConfig() {
  const res = await api.get('/mail/config')
  return res.data
}

export async function updateInboundMailConfig(payload: { defaultQueue: string }) {
  const res = await api.post('/mail/config/inbound', payload)
  return res.data
}

export async function testSmtp(payload: any) {
  const res = await api.post('/mail/smtp/test', payload)
  return res.data
}

export async function testImap(payload: any) {
  const res = await api.post('/mail/imap/test', payload)
  return res.data
}

export async function sendMailTest(payload: any) {
  const res = await api.post('/mail/smtp/send', payload)
  return res.data
}

export async function getDatabaseConfig() {
  const res = await api.get('/system/database/config')
  return res.data
}

export async function testDatabaseConfig(payload: any) {
  const res = await api.post('/system/database/test', payload)
  return res.data
}
