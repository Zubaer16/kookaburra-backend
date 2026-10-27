import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import {
  AdjustInventoryDto,
  AdjustmentReason,
  InventoryQueryDto,
  MovementQueryDto,
  SetLowStockThresholdDto,
} from './inventory.dto'

const withIdentity = {
  product: { select: { id: true, sku: true, title: true, hasVariants: true } },
  variant: {
    select: {
      id: true,
      sku: true,
      productId: true,
      product: { select: { title: true } },
    },
  },
} as const

type BalanceWithIdentity = Prisma.InventoryBalanceGetPayload<{
  include: typeof withIdentity
}>

function active(balance: BalanceWithIdentity): boolean {
  return Boolean(
    balance.variant || (balance.product && !balance.product.hasVariants),
  )
}
function present(balance: BalanceWithIdentity) {
  return {
    id: balance.id,
    productId: balance.product?.id ?? balance.variant?.productId,
    variantId: balance.variant?.id ?? null,
    sku: balance.variant?.sku ?? balance.product?.sku,
    title: balance.product?.title ?? balance.variant?.product.title,
    onHand: balance.onHand,
    reservedQuantity: balance.reservedQuantity,
    availableQuantity: balance.onHand - balance.reservedQuantity,
    lowStockThreshold: balance.lowStockThreshold,
    lowStock: balance.onHand <= balance.lowStockThreshold,
    updatedAt: balance.updatedAt,
  }
}

@Injectable()
export class InventoryService {
  constructor(private readonly database: DatabaseService) {}

  private readonly visible: Prisma.InventoryBalanceWhereInput = {
    OR: [
      { product: { is: { hasVariants: false } } },
      { variant: { isNot: null } },
    ],
  }

  async list(query: InventoryQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const where: Prisma.InventoryBalanceWhereInput = {
      AND: [
        this.visible,
        ...(query.productId
          ? [
              {
                OR: [
                  { productId: query.productId },
                  { variant: { is: { productId: query.productId } } },
                ],
              },
            ]
          : []),
        ...(query.variantId ? [{ variantId: query.variantId }] : []),
        ...(query.lowStock === 'true'
          ? [
              {
                onHand: {
                  lte: this.database.client.inventoryBalance.fields
                    .lowStockThreshold,
                },
              },
            ]
          : query.lowStock === 'false'
            ? [
                {
                  onHand: {
                    gt: this.database.client.inventoryBalance.fields
                      .lowStockThreshold,
                  },
                },
              ]
            : []),
      ],
    }
    const [items, total] = await this.database.client.$transaction([
      this.database.client.inventoryBalance.findMany({
        where,
        include: withIdentity,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.client.inventoryBalance.count({ where }),
    ])
    return {
      items: items.map(present),
      total,
      page,
      limit,
      pageSize: limit,
      pages: Math.ceil(total / limit),
    }
  }

  async get(id: string) {
    return present(await this.requireVisible(this.database.client, id))
  }

  async movements(id: string, query: MovementQueryDto) {
    await this.requireVisible(this.database.client, id)
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const where = { balanceId: id }
    const [items, total] = await this.database.client.$transaction([
      this.database.client.inventoryMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.client.inventoryMovement.count({ where }),
    ])
    return {
      items,
      total,
      page,
      limit,
      pageSize: limit,
      pages: Math.ceil(total / limit),
    }
  }

  async threshold(id: string, input: SetLowStockThresholdDto, actorId: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.requireVisible(tx, id)
      const updated = await tx.inventoryBalance.update({
        where: { id },
        data: { lowStockThreshold: input.lowStockThreshold },
        include: withIdentity,
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'inventory.threshold.updated',
          targetType: 'inventory_balance',
          targetId: id,
        },
      })
      return present(updated)
    })
  }

  async adjust(id: string, input: AdjustInventoryDto, actorId: string) {
    if (
      (input.reason === AdjustmentReason.RECEIPT ||
        input.reason === AdjustmentReason.RETURN) &&
      input.delta < 0
    )
      throw new BadRequestException(
        'Receipt and return adjustments must increase stock',
      )
    if (input.reason === AdjustmentReason.DAMAGE && input.delta > 0)
      throw new BadRequestException('Damage adjustments must decrease stock')
    const note = input.note?.trim() ?? ''
    const matching = (existing: {
      delta: number
      reason: string
      note: string
    }) => {
      if (
        existing.delta !== input.delta ||
        existing.reason !== input.reason ||
        existing.note !== note
      )
        throw new ConflictException(
          'Idempotency key reused for a different adjustment',
        )
    }
    try {
      return await this.database.client.$transaction(async (tx) => {
        const balance = await this.requireVisible(tx, id)
        const existing = await tx.inventoryMovement.findUnique({
          where: {
            balanceId_requestId: { balanceId: id, requestId: input.requestId },
          },
        })
        if (existing) {
          matching(existing)
          return {
            movement: existing,
            inventory: present(balance),
            replayed: true,
          }
        }
        // Atomic guarded SQL UPDATE through Prisma; concurrent requests cannot
        // overwrite each other or make stock negative / overflow INT32.
        // PostgreSQL atomic guarded update: physical stock cannot drop below
        // active holds even when an admin adjustment races a reservation.
        const changed = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE inventory_balances
          SET on_hand = on_hand + ${input.delta}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          WHERE id = ${id}::uuid
            AND on_hand::bigint + ${input.delta} >= reserved_quantity
            AND on_hand::bigint + ${input.delta} <= 2147483647
          RETURNING id
        `
        if (!changed.length)
          throw new ConflictException(
            'Insufficient stock or stock limit exceeded',
          )
        const updated = await tx.inventoryBalance.findUniqueOrThrow({
          where: { id },
          include: withIdentity,
        })
        const before = updated.onHand - input.delta
        if (updated.productId) {
          await tx.product.update({
            where: { id: updated.productId },
            data: { stockOnHand: updated.onHand },
          })
        } else if (updated.variantId) {
          await tx.productVariant.update({
            where: { id: updated.variantId },
            data: { stockOnHand: updated.onHand },
          })
        }
        const movement = await tx.inventoryMovement.create({
          data: {
            balanceId: id,
            requestId: input.requestId,
            delta: input.delta,
            before,
            after: updated.onHand,
            reason: input.reason,
            note,
            actorId,
          },
        })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'inventory.adjusted',
            targetType: 'inventory_balance',
            targetId: id,
          },
        })
        return { movement, inventory: present(updated), replayed: false }
      })
    } catch (error) {
      // Two in-flight requests using the same idempotency UUID: one transaction
      // commits; the unique loser rolls back, then can return the winner safely.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing =
          await this.database.client.inventoryMovement.findUnique({
            where: {
              balanceId_requestId: {
                balanceId: id,
                requestId: input.requestId,
              },
            },
          })
        if (existing) {
          matching(existing)
          return {
            movement: existing,
            inventory: await this.get(id),
            replayed: true,
          }
        }
      }
      throw error
    }
  }

  private async requireVisible(
    tx: Pick<Prisma.TransactionClient, 'inventoryBalance'>,
    id: string,
  ): Promise<BalanceWithIdentity> {
    const balance = await tx.inventoryBalance.findUnique({
      where: { id },
      include: withIdentity,
    })
    if (!balance || !active(balance))
      throw new NotFoundException('Inventory item not found')
    return balance
  }
}
