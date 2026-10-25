/** Local-only first-owner bootstrap. Never exposed over HTTP. */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD
  if (
    !url ||
    !email ||
    !password ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 12
  ) {
    throw new Error(
      'Set DATABASE_URL, BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD (12+ chars)',
    )
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  })
  try {
    const owners = await prisma.user.count({ where: { role: 'OWNER' } })
    if (owners > 0)
      throw new Error('Owner already exists. Refusing to create another owner.')
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error('Account already exists with that email.')
    }
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: 'OWNER',
        staffRoleAssignment: { create: { roleKey: 'OWNER' } },
      },
    })
    process.stdout.write(
      'First OWNER account created. Clear BOOTSTRAP_OWNER_PASSWORD from environment.\n',
    )
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Owner bootstrap failed'}\n`,
  )
  process.exitCode = 1
})
