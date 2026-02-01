import dotenv from 'dotenv'
dotenv.config()

import prisma from '../src/prisma/client'
import bcrypt from 'bcrypt'

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@itsm.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  const hashed = await bcrypt.hash(adminPassword, 12)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashed,
      name: 'Administrator',
      role: 'ADMIN',
    },
  })
  // create sample agent and end user
  const agentEmail = 'agent@itsm.com'
  const userEmail = 'user@itsm.com'
  const agentPass = await bcrypt.hash('agent123', 12)
  const userPass = await bcrypt.hash('user123', 12)

  const agent = await prisma.user.upsert({
    where: { email: agentEmail },
    update: {},
    create: {
      email: agentEmail,
      password: agentPass,
      name: 'Agent Smith',
      role: 'AGENT',
    },
  })

  const endUser = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      password: userPass,
      name: 'End User',
      phone: '07772817814',
      client: 'sksquaregroup',
      site: 'Halo House',
      accountManager: 'Girikumaran M S',
      role: 'USER',
    },
  })

  // sample asset
  const asset = await prisma.asset.create({
    data: {
      name: 'Laptop - Dell XPS 13',
      serial: 'DX13-0001',
      category: 'Laptop',
      status: 'Available',
      vendor: 'Dell',
      purchaseDate: new Date(),
    },
  })

  // sample ticket
  await prisma.ticket.create({
    data: {
      ticketId: `TKT-${Date.now()}`,
      type: 'Incident',
      priority: 'Medium',
      impact: 'Moderate',
      urgency: 'Medium',
      status: 'New',
      category: 'Hardware',
      subcategory: 'Laptop',
      description: 'Screen flickering intermittently',
      requesterId: endUser.id,
      assigneeId: agent.id,
      slaStart: new Date(),
    },
  })

  console.log('✅ Seed completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

