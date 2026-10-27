import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { SetCartItemDto } from './cart.dto'

/** Shared between authenticated & guest carts: stock never comes from client input. */
export async function validateCartSelection(
  tx: Prisma.TransactionClient,
  input: SetCartItemDto,
) {
  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      status: true,
      hasVariants: true,
      currency: true,
      inventoryBalance: { select: { onHand: true, reservedQuantity: true } },
    },
  })
  if (!product || product.status !== 'ACTIVE')
    throw new ConflictException('Product is not available')
  const variantId = input.variantId ?? null
  if (product.hasVariants && !variantId)
    throw new BadRequestException('Select a product variant')
  if (!product.hasVariants && variantId)
    throw new BadRequestException('Simple product does not accept a variant')
  let stock =
    (product.inventoryBalance?.onHand ?? 0) -
    (product.inventoryBalance?.reservedQuantity ?? 0)
  if (variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: {
        productId: true,
        inventoryBalance: { select: { onHand: true, reservedQuantity: true } },
      },
    })
    if (!variant || variant.productId !== input.productId)
      throw new BadRequestException('Variant does not belong to product')
    stock =
      (variant.inventoryBalance?.onHand ?? 0) -
      (variant.inventoryBalance?.reservedQuantity ?? 0)
  }
  if (input.quantity > stock)
    throw new ConflictException('Insufficient stock for requested quantity')
  return { product, variantId }
}
