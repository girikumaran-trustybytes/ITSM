import { Request, Response } from 'express'

export async function handleNotificationWebhook(req: Request, res: Response) {
  // Simple passthrough webhook handler — in production verify signature
  console.log('[Webhook] received', { body: req.body })
  res.json({ received: true })
}
