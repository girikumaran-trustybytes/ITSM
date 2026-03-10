import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler } from './common/middleware/error.middleware'
import { ensureRbacSeeded } from './modules/users/rbac.service'

const app = express()
const allowedOrigins = String(
	process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173'
)
	.split(',')
	.map((origin) => origin.trim())
	.filter((origin) => origin.length > 0)

void ensureRbacSeeded().catch((error) => {
	// Keep API boot resilient; authorization middleware still has safe fallbacks.
	console.error('RBAC seed initialization failed:', error)
})

app.use(
	cors({
		origin: (origin, callback) => {
			// Allow non-browser tools and same-origin calls with no Origin header.
			if (!origin) return callback(null, true)
			if (allowedOrigins.includes(origin)) return callback(null, true)
			return callback(new Error('CORS origin not allowed'))
		},
		credentials: true,
	})
)
app.use(express.json({ limit: '50mb' }))
app.use(morgan('dev'))

// Normalize incoming requests that accidentally include a duplicate `/api` prefix
// e.g. `/api/api/auth/login` -> `/api/auth/login`
app.use((req, _res, next) => {
	if (req.url.startsWith('/api/api/')) {
		req.url = req.url.replace('/api/api/', '/api/')
	} else if (req.url === '/api/api') {
		req.url = '/api'
	}
	next()
})

// API routes
app.use('/api', routes)

// health
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// error handler (always last)
app.use(errorHandler)

export default app
