import { Controller, Get, Header } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublicStoreBootstrapDto } from './store-bootstrap.dto'
import { StoreBootstrapService } from './store-bootstrap.service'

@ApiTags('Store Bootstrap / Public')
@Controller('store/bootstrap')
export class StoreBootstrapController {
  constructor(private readonly bootstrap: StoreBootstrapService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Read public store identity, published content and verified media branding in one response',
    description:
      'Read-only composition. No administrative revisions, credentials or unpublished media identifiers. Empty/unconfigured fields are explicit. Store pricing, policy, payment and CORS remain authoritative elsewhere.',
  })
  @ApiOkResponse({ type: PublicStoreBootstrapDto })
  get() {
    return this.bootstrap.get()
  }
}
