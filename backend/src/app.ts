import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler } from './common/middleware/error.middleware'

const app = express()

app.use(cors())
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
