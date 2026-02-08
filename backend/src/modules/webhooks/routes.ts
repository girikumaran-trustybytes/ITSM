import { Router } from 'express'
import { handleNotificationWebhook } from './webhooks.controller'

const router = Router()

router.post('/notifications', handleNotificationWebhook)

export default router
