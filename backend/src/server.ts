import './load-env'
import app from './app'
// start background jobs (SLA checks, notifications)
import './jobs/sla.job'
import { startMailToTicketJob } from './jobs/mail-to-ticket.job'
// import { startSlaWorker } from './jobs/sla.worker'
import logger from './common/logger/logger'

const PORT = Number(process.env.PORT || 5000)

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
  // SLA worker disabled temporarily - will re-enable after core functionality verified
  // startSlaWorker()
  startMailToTicketJob()
})

server.on('error', (err) => {
  logger.info('Server error:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.info('Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  logger.info('Uncaught exception:', err)
  process.exit(1)
})
