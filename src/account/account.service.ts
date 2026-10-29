import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import type {
  CustomerAddressInputDto,
  UpdateCustomerAddressDto,
} from './account.dto'

const ADDRESS_LIMIT = 10
const clean = (s: string | undefined): string | undefined =>
  s === undefined ? undefined : s.trim()
const addressFields = {
  id: true,
  label: true,
  recipientName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  countryCode: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const

type AddressRow = Prisma.CustomerAddressGetPayload<{
  select: typeof addressFields
}>

function output(row: AddressRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function fields(dto: CustomerAddressInputDto | UpdateCustomerAddressDto) {
  return {
    ...(dto.label !== undefined ? { label: clean(dto.label) } : {}),
    ...(dto.recipientName !== undefined
      ? { recipientName: clean(dto.recipientName) }
      : {}),
    ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
    ...(dto.addressLine1 !== undefined
      ? { addressLine1: clean(dto.addressLine1) }
      : {}),
    ...(dto.addressLine2 !== undefined
      ? { addressLine2: clean(dto.addressLine2) }
      : {}),
    ...(dto.city !== undefined ? { city: clean(dto.city) } : {}),
    ...(dto.region !== undefined ? { region: clean(dto.region) } : {}),
    ...(dto.postalCode !== undefined
      ? { postalCode: clean(dto.postalCode) }
      : {}),
    ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
  }
}

@Injectable()
export class AccountService {
  constructor(private readonly database: DatabaseService) {}

  async profile(userId: string) {
    const user = await this.database.client.user.findUnique({
      where: { id: userId, role: 'CUSTOMER', status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    })
    if (!user) throw new NotFoundException('Customer account not found')
    return { ...user, createdAt: user.createdAt.toISOString() }
  }

  async updateProfile(userId: string, displayName: string) {
    const name = displayName.trim()
    if (!name) throw new BadRequestException('Display name cannot be blank')
    await this.database.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId, role: 'CUSTOMER', status: 'ACTIVE' },
        data: { displayName: name },
      })
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'customer.profile_updated',
          targetType: 'user',
          targetId: userId,
        },
      })
    })
    return this.profile(userId)
  }

  async listAddresses(userId: string) {
    const rows = await this.database.client.customerAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: ADDRESS_LIMIT,
      select: addressFields,
    })
    return { items: rows.map(output), count: rows.length }
  }

  async createAddress(userId: string, dto: CustomerAddressInputDto) {
    const id = await this.database.client.$transaction(
      async (tx) => {
        // One user-level row lock serializes all address mutations including default changes.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
        const count = await tx.customerAddress.count({ where: { userId } })
        if (count >= ADDRESS_LIMIT)
          throw new ConflictException('Address book is full (10)')
        const selectDefault = count === 0 || dto.isDefault === true
        if (selectDefault && count > 0)
          await tx.customerAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          })
        const created = await tx.customerAddress.create({
          data: {
            userId,
            ...fields(dto),
            isDefault: selectDefault,
          } as Prisma.CustomerAddressUncheckedCreateInput,
          select: { id: true },
        })
        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: 'customer.address_created',
            targetType: 'customer_address',
            targetId: created.id,
          },
        })
        return created.id
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
    return this.getAddress(userId, id)
  }

  async getAddress(userId: string, id: string) {
    const row = await this.database.client.customerAddress.findFirst({
      where: { id, userId },
      select: addressFields,
    })
    if (!row) throw new NotFoundException('Address not found')
    return output(row)
  }

  async updateAddress(
    userId: string,
    id: string,
    dto: UpdateCustomerAddressDto,
  ) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('No address fields provided')
    await this.database.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
        const row = await tx.customerAddress.findFirst({
          where: { id, userId },
          select: { id: true, isDefault: true },
        })
        if (!row) throw new NotFoundException('Address not found')
        if (dto.isDefault === false && row.isDefault)
          throw new ConflictException('Choose another default address first')
        if (dto.isDefault === true && !row.isDefault)
          await tx.customerAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          })
        await tx.customerAddress.update({
          where: { id, userId },
          data: {
            ...fields(dto),
            ...(dto.isDefault === true ? { isDefault: true } : {}),
          },
        })
        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: 'customer.address_updated',
            targetType: 'customer_address',
            targetId: id,
          },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
    return this.getAddress(userId, id)
  }

  async deleteAddress(userId: string, id: string) {
    await this.database.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
        const row = await tx.customerAddress.findFirst({
          where: { id, userId },
          select: { isDefault: true },
        })
        if (!row) throw new NotFoundException('Address not found')
        await tx.customerAddress.delete({ where: { id, userId } })
        if (row.isDefault) {
          const next = await tx.customerAddress.findFirst({
            where: { userId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          })
          if (next)
            await tx.customerAddress.update({
              where: { id: next.id, userId },
              data: { isDefault: true },
            })
        }
        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: 'customer.address_deleted',
            targetType: 'customer_address',
            targetId: id,
          },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
    return { deleted: true }
  }
}
