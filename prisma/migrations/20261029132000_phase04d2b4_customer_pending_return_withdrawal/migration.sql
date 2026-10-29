-- G1 / 04D-2B-4: pending return withdrawal. No existing return data is deleted.
-- Only the transactional service may transition REQUESTED -> CANCELLED.
ALTER TYPE "OrderReturnStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
