import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler } from './common/middleware/error.middleware'

const app = express()

app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

// API routes
app.use('/api', routes)

// health
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// error handler (always last)
app.use(errorHandler)

export default app
