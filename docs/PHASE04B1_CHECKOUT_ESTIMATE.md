# Phase 04B-1 — Live Checkout Estimate & Country/Currency Rate Policies

Backend baseline: `kookaburra-backend-full-20261027-184821.zip`. Incremental overlay, no Storefront/Admin source overwritten.

## Scope and exact boundaries

Implemented: JWT-authenticated CUSTOMER checkout estimate; explicit OWNER-maintained country/currency shipping/tax _estimate_ policy; live server-side cart pricing and stock eligibility; integer minor units, positive money bounds, deterministic tax rounding, optional free-shipping threshold, and no silent country or currency fallback.

**Not implemented:** inventory reservations or expiration/release, order creation, checkout/address acceptance, tax compliance, tax exemptions, region/postal rates, coupons, payments/Stripe, guest checkout without JWT, or payable/guaranteed totals. An estimated total MUST NOT be used as a charge authorization. Checkout still requires later Phase 04B-2+ and API integration.

## REST API

All endpoints require Bearer `access-token` JWT.

- `PUT /v1/admin/checkout/rates` — OWNER only, idempotent upsert of `countryCode`, `currency`, `shippingMinor`, `freeOverSubtotalMinor` (nullable), `taxBps`, `enabled`. Returns HTTP 200. Disabled policy is not usable. Each owner policy change writes an actor-linked audit event within the same database transaction.
- `GET /v1/admin/checkout/rates` — OWNER only; lists configured policies; 200.
- `POST /v1/checkout/estimate` — CUSTOMER only; body `{"countryCode":"US"}`; 200 for eligible cart and enabled policy; 409 for unavailable/empty cart; 422 for unsupported country/currency. Validation rejects unknown fields, non-uppercase country codes, and client-supplied totals.

Admin example policy (illustrative numbers, **not a real jurisdiction rate recommendation**):

```json
{
  "countryCode": "US",
  "currency": "USD",
  "shippingMinor": 500,
  "freeOverSubtotalMinor": 10000,
  "taxBps": 750,
  "enabled": true
}
```

`taxBps` is applied to the _merchandise subtotal only_, excluding shipping. Integer rounding is half-up for non-negative amounts; if subtotal is at least the free-shipping threshold, shipping is 0. Example formula: tax = floor((subtotal_minor * tax_bps + 5000) / 10000). Country-only flat tax rates are deliberately *estimates\*, not statutory tax computation. Missing configuration is a hard error, **never** implicit zero tax/free shipping. Test and verify any rules against applicable tax/consumer laws with qualified local resources before commercial use.

Response example for a live, eligible cart:

```json
{
  "cartId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "countryCode": "US",
  "currency": "USD",
  "subtotalMinor": 5000,
  "shippingMinor": 500,
  "taxMinor": 375,
  "estimatedTotalMinor": 5875,
  "appliedTaxBps": 750,
  "quotedAt": "2026-10-27T12:00:00.000Z",
  "reservationStatus": "NOT_RESERVED",
  "payable": false,
  "notice": "Estimate only. No stock reserved, order created or payment authorized. Verify jurisdiction-specific tax and address rules before checkout."
}
```

## Deployment and test sequence (Windows PowerShell)

From repository root, after backups of development and isolated test DBs:

```powershell
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:checkout
npm run test:api:visual:all
npm run alignment:test
```

No database reset or drops. The only new table is `checkout_rates`; no rules are auto-seeded. `npm run test:api:db` remains guarded to `kookaburra_api_test` on localhost, never development or Neon. Browser/DB tests require local Node 24 and PostgreSQL, unavailable in the patch construction runtime; accept only after local passes.

## Next increment — Phase 04B-2

Design a durable SKU-level reservation ledger with `RESERVED`, `COMMITTED`, `RELEASED`, `EXPIRED` states, TTL sweeper, replay-safe idempotency, serialized balance row locking (including negative stock adjustments), webhook-safe conversion to paid orders, and correct release on failed payment. Recheck price/tax/shipping at reservation. Refuse quantities when `on_hand - active_reservations` is insufficient. Current `stock_on_hand` field must remain physical stock and never represent a reservation decrement.
