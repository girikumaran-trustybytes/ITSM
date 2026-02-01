import prisma from '../../prisma/client'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7)
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret'

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Invalid credentials')

  const ok = await bcrypt.compare(password, user.password)
  if (!ok) throw new Error('Invalid credentials')

  const accessToken = (jwt as any).sign({ sub: user.id, role: user.role }, ACCESS_SECRET as any, {
    expiresIn: ACCESS_EXPIRES,
  })

  const refreshToken = (jwt as any).sign({ sub: user.id }, REFRESH_SECRET as any, {
    expiresIn: `${REFRESH_EXPIRES_DAYS}d`,
  })

  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt,
    },
  })

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } }
}

export async function refresh(refreshToken: string) {
  try {
    const payload = (jwt as any).verify(refreshToken, REFRESH_SECRET) as any
    const record = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!record || record.revoked) throw new Error('Invalid refresh token')

    const user = await prisma.user.findUnique({ where: { id: record.userId } })
    if (!user) throw new Error('User not found')

    const accessToken = (jwt as any).sign({ sub: user.id, role: user.role }, ACCESS_SECRET as any, {
      expiresIn: ACCESS_EXPIRES,
    })

    return { accessToken }
  } catch (err) {
    throw new Error('Invalid refresh token')
  }
}

