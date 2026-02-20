import { Router } from 'express'
import { forgotPassword, login, loginWithGoogle, refresh, resetPassword, verifyMfa, changePassword, googleConfig, ssoConfig, ssoStart, ssoCallback } from './auth.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'

const router = Router()

router.post('/login', login)
router.post('/google', loginWithGoogle)
router.get('/google/config', googleConfig)
router.get('/sso/config', ssoConfig)
router.get('/sso/:provider/start', ssoStart)
router.get('/sso/:provider/callback', ssoCallback)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/mfa/verify', verifyMfa)
router.post('/refresh', refresh)
router.post('/change-password', authenticateJWT, changePassword)

export default router

