// Stub mailer service - implement actual email sending as needed
export default {
  async sendTicketCreated(email: string, ticket: any) {
    console.log(`[MAILER STUB] Ticket created email would be sent to ${email}`)
  },

  async sendStatusUpdated(email: string, ticket: any) {
    console.log(`[MAILER STUB] Status updated email would be sent to ${email}`)
  },

  async sendTicketResponse(email: string, ticket: any, message: string) {
    console.log(`[MAILER STUB] Ticket response email would be sent to ${email}`)
  },

  async sendTicketResolved(email: string, ticket: any) {
    console.log(`[MAILER STUB] Ticket resolved email would be sent to ${email}`)
  },
}
