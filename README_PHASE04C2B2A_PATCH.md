# Kookaburra Phase 04C-2B2A — TEST PaymentIntent cancellation recovery

Apply only over the validated `kookaburra-backend-full-20261028-101958.zip` snapshot. This is a root-level `.tar.gz` overlay, no reset/reseed or frontend changes.

**Read `docs/PHASE04C2B2A_TEST_PROVIDER_CANCELLATION.md` before migrating or running the operator worker.** All tests must be run in the user's Windows local PostgreSQL and Chromium environment. The patch is not yet accepted until those commands pass.

The default Stripe test feature remains OFF. No client_secret or payment capture/refund endpoint was added. Never operate the worker using live Stripe credentials or unverified target databases.
