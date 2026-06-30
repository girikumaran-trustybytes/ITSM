import { Router } from 'express'
import { handleNotificationWebhook, verifyNotificationWebhook } from './webhooks.controller'

const router = Router()

router.post('/notifications', verifyNotificationWebhook, handleNotificationWebhook)

export default router
