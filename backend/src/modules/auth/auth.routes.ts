import { Router } from 'express'
import { forgotPassword, login, loginWithGoogle, refresh, resetPassword, verifyMfa, changePassword, googleConfig, ssoConfig, ssoStart, ssoCallback, acceptInvite, getMfaPolicy, updateMfaPolicy, getMyMfaSettings, updateMyMfaSettings, updateUserMfaSettings, requestMfaChallenge, setupAuthenticator, verifyAuthenticatorSetup, resetAuthenticator } from './auth.controller'
import { authenticateJWT } from '../../common/middleware/auth.middleware'
import { requirePermission } from '../../common/middleware/permission.middleware'

const router = Router()

router.post('/login', login)
router.post('/google', loginWithGoogle)
router.get('/google/config', googleConfig)
router.get('/sso/config', ssoConfig)
router.get('/sso/:provider/start', ssoStart)
router.get('/sso/:provider/callback', ssoCallback)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/accept-invite', acceptInvite)
router.post('/mfa/challenge', requestMfaChallenge)
router.post('/mfa/verify', verifyMfa)
router.post('/refresh', refresh)
router.post('/change-password', authenticateJWT, changePassword)
router.get('/mfa/me', authenticateJWT, getMyMfaSettings)
router.put('/mfa/me', authenticateJWT, updateMyMfaSettings)
router.get('/mfa/policy', authenticateJWT, requirePermission('system.configure'), getMfaPolicy)
router.put('/mfa/policy', authenticateJWT, requirePermission('system.configure'), updateMfaPolicy)
router.put('/mfa/users/:id', authenticateJWT, requirePermission('system.configure'), updateUserMfaSettings)
router.post('/mfa/authenticator/setup', authenticateJWT, setupAuthenticator)
router.post('/mfa/authenticator/verify', authenticateJWT, verifyAuthenticatorSetup)
router.post('/mfa/authenticator/reset', authenticateJWT, resetAuthenticator)

export default router

