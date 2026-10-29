import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import type { Prisma } from '../generated/prisma/client'
import { AdminCustomersQueryDto } from './customers.dto'

// Read-only, strictly projected customer directory. Never return password hashes,
// session tokens, stored addresses, shipping snapshots, or payment instruments.
@Injectable()
export class CustomersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: AdminCustomersQueryDto) {
    const search = query.search?.trim()
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      ...(query.status && { status: query.status }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true } },
          orders: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      this.database.client.user.count({ where }),
    ])
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        status: row.status,
        createdAt: row.createdAt,
        orderCount: row._count.orders,
        lastOrderAt: row.orders[0]?.createdAt ?? null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    }
  }

  async detail(id: string) {
    const row = await this.database.client.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        _count: { select: { orders: true, customerAddresses: true } },
        orders: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
          select: { id: true, status: true, createdAt: true },
        },
      },
    })
    if (!row) throw new NotFoundException('Customer not found')
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      createdAt: row.createdAt,
      orderCount: row._count.orders,
      savedAddressCount: row._count.customerAddresses,
      lastOrderAt: row.orders[0]?.createdAt ?? null,
      recentOrders: row.orders,
    }
  }
}
