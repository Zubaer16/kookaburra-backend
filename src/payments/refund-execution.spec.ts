import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { RefundExecutionService } from './refund-execution.service'
import { StripeTestGateway } from './stripe-gateway'

describe('Stripe TEST refund worker safety gate', () => {
  it('refuses a refund without explicit opt-in, before any DB/provider operation', async () => {
    const db = { client: { refundRequest: { findMany: jest.fn() } } }
    const gateway = { createRefund: jest.fn(), retrieveRefund: jest.fn() }
    const config = {
      get: (key: string) =>
        key === 'NODE_ENV' ? 'test' : key === 'STRIPE_TEST_ENABLED',
    }
    const worker = new RefundExecutionService(
      db as unknown as DatabaseService,
      config as unknown as ConfigService<Environment, true>,
      gateway as unknown as StripeTestGateway,
    )
    await expect(worker.processBatch()).rejects.toThrow('disabled')
    expect(db.client.refundRequest.findMany).not.toHaveBeenCalled()
    expect(gateway.createRefund).not.toHaveBeenCalled()
  })
})
