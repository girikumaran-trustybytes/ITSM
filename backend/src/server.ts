import app from './app'
// start background jobs (SLA checks, notifications)
import './jobs/sla.job'
import logger from './common/logger/logger'

const PORT = Number(process.env.PORT || 5000)

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
})
