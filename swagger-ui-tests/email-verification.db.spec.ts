import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import { decryptEmailActionToken, type EncryptedActionToken } from '../src/auth/email-verification.crypto'
import { openSwagger, authorizeInSwagger, swaggerExecute } from './swagger-helper'

test('05A-5 Swagger Chromium: email verification request and confirm Try it out Execute',async ({page, request})=>{
  const f=new CatalogTestFixture(request)
  let userId=''
  try {
    const customer=await f.account('CUSTOMER');userId=customer.id
    await openSwagger(page)
    await swaggerExecute(page,'POST','/v1/auth/email-verification/request',401)
    await authorizeInSwagger(page,customer.token)
    const queued=await swaggerExecute(page,'POST','/v1/auth/email-verification/request',202)
    expect(await queued.json()).toEqual({accepted:true})
    const outbox=await f.db.outboxEvent.findFirstOrThrow({
      where:{eventType:'auth.email_verification.requested',payload:{path:['userId'],equals:userId}},
    })
    const data=outbox.payload as unknown as {eventId:string;token:EncryptedActionToken}
    const token=decryptEmailActionToken(process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY!,data.token,`${userId}:${data.eventId}`)
    const result=await swaggerExecute(page,'POST','/v1/auth/email-verification/confirm',200,{token})
    expect(await result.json()).toEqual({accepted:true})
    await swaggerExecute(page,'POST','/v1/auth/email-verification/confirm',400,{token})
  }finally{
    if(userId) await f.db.outboxEvent.deleteMany({where:{eventType:'auth.email_verification.requested',payload:{path:['userId'],equals:userId}}})
    await f.close()
  }
})
