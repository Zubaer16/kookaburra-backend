import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { quoteIncludes } from '../cart/cart.service'
import { calculateCartQuote } from '../cart/cart.quote'
import { CheckoutEstimateDto, PutCheckoutRateDto } from './checkout.dto'
import { estimateConfiguredCharges } from './checkout.pricing'

@Injectable()
export class CheckoutService {
  constructor(private readonly database: DatabaseService) {}

  /** Read-only reprice: no inventory hold, no order or payment, and no payable amount promised. */
  async estimate(customerId: string, input: CheckoutEstimateDto) {
    return this.database.client.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId: customerId },
          include: quoteIncludes,
        })
        const quote = calculateCartQuote(cart?.id ?? null, cart?.items ?? [])
        if (!quote.checkoutReady || !quote.cartId || !quote.currency)
          throw new ConflictException({
            message: 'Cart is not checkout-ready',
            issues: quote.issues,
          })
        const rate = await tx.checkoutRate.findUnique({
          where: {
            countryCode_currency: {
              countryCode: input.countryCode,
              currency: quote.currency,
            },
          },
        })
        if (!rate || !rate.enabled)
          throw new UnprocessableEntityException(
            'No enabled shipping/tax policy for this country and cart currency',
          )
        const charges = estimateConfiguredCharges(
          quote.subtotalMinor,
          rate.shippingMinor,
          rate.freeOverSubtotalMinor,
          rate.taxBps,
        )
        return {
          cartId: quote.cartId,
          countryCode: input.countryCode,
          currency: quote.currency,
          subtotalMinor: quote.subtotalMinor,
          ...charges,
          appliedTaxBps: rate.taxBps,
          quotedAt: quote.quotedAt,
          reservationStatus: 'NOT_RESERVED' as const,
          payable: false as const,
          notice:
            'Estimate only. No stock reserved, order created or payment authorized. Verify jurisdiction-specific tax and address rules before checkout.',
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  /** OWNER-only explicit lane configuration; no implicit fallbacks between countries/currencies. */
  listRates() {
    return this.database.client.checkoutRate.findMany({
      orderBy: [{ countryCode: 'asc' }, { currency: 'asc' }],
    })
  }

  async putRate(input: PutCheckoutRateDto, actorId: string) {
    return this.database.client.$transaction(async (tx) => {
      const rate = await tx.checkoutRate.upsert({
        where: {
          countryCode_currency: {
            countryCode: input.countryCode,
            currency: input.currency,
          },
        },
        create: {
          countryCode: input.countryCode,
          currency: input.currency,
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
          taxBps: input.taxBps,
          enabled: input.enabled,
        },
        update: {
          shippingMinor: input.shippingMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor ?? null,
          taxBps: input.taxBps,
          enabled: input.enabled,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'checkout.rate.upserted',
          targetType: 'checkout_rate',
          targetId: rate.id,
        },
      })
      return rate
    })
  }
}
