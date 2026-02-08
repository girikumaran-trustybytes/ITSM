import dotenv from 'dotenv'
dotenv.config()

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@itsm.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123!'

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
  const agentPass = await bcrypt.hash('agent123!', 12)
  const userPass = await bcrypt.hash('user123!', 12)

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

  // sample asset (idempotent)
  const existingAsset = await prisma.asset.findFirst({ where: { serial: 'DX13-0001' } })
  if (existingAsset) {
    await prisma.asset.update({
      where: { id: existingAsset.id },
      data: {
        assetId: existingAsset.assetId || 'AST-0001',
        assetType: 'Laptop',
        name: 'Laptop - Dell XPS 13',
        category: 'Laptop',
        status: 'Available',
        vendor: 'Dell',
        purchaseDate: new Date(),
      },
    })
  } else {
    await prisma.asset.create({
      data: {
        assetId: 'AST-0001',
        assetType: 'Laptop',
        name: 'Laptop - Dell XPS 13',
        serial: 'DX13-0001',
        category: 'Laptop',
        status: 'Available',
        vendor: 'Dell',
        purchaseDate: new Date(),
      },
    })
  }

  // sample ticket (guard against duplicates)
  try {
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
        requester: { connect: { id: endUser.id } },
        assignee: { connect: { id: agent.id } },
        // slaStart removed from seed to avoid requiring DB column during initial setup
      },
    })
  } catch (e: any) {
    // ignore unique constraint errors if running seed multiple times
    if (e.code !== 'P2002') throw e
  }

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

