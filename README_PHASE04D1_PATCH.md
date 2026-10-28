# Phase 04D-1 — Paid Order Fulfillment & Tracking

Baseline: `kookaburra-backend-full-20261028-154444.zip`. Root-level overlay `.tar.gz` only. Extract archive at backend repo root in Windows PowerShell. Check `docs/PHASE04D1_ORDER_FULFILLMENT.md` for guarded migration/testing steps.

Admin routes require `orders.manage` (not just staff role). Unpaid order cannot ship. One shipment per paid order; no carrier API calls; no payment/refund/inventory mutation. Frontends and Flutter are separate integrations.
