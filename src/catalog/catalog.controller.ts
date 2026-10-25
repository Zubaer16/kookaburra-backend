import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CatalogService } from './catalog.service'
import { CatalogWriteGuard } from './catalog.write.guard'
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto'

@ApiTags('Catalog / Storefront')
@Controller()
export class StorefrontCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List public category tree nodes' })
  listCategories() {
    return this.catalog.listCategories()
  }

  @Get('products')
  @ApiOperation({
    summary: 'Paginated ACTIVE products; optional search and category slug',
  })
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalog.listProducts(query, false)
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Find an ACTIVE product by its canonical slug' })
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getPublicProduct(slug)
  }
}

@ApiTags('Catalog / Admin')
@Controller('admin')
@UseGuards(AccessGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  listCategories() {
    return this.catalog.listCategories()
  }

  @Post('categories')
  @UseGuards(CatalogWriteGuard)
  createCategory(
    @Body() input: CreateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.createCategory(input, request.authUser!.id)
  }

  @Patch('categories/:id')
  @UseGuards(CatalogWriteGuard)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.updateCategory(id, input, request.authUser!.id)
  }

  @Delete('categories/:id')
  @UseGuards(CatalogWriteGuard)
  deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.deleteCategory(id, request.authUser!.id)
  }

  @Get('products')
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalog.listProducts(query, true)
  }

  @Get('products/:id')
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getAdminProduct(id)
  }

  @Post('products')
  @UseGuards(CatalogWriteGuard)
  createProduct(
    @Body() input: CreateProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.createProduct(input, request.authUser!.id)
  }

  @Patch('products/:id')
  @UseGuards(CatalogWriteGuard)
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.updateProduct(id, input, request.authUser!.id)
  }

  @Delete('products/:id')
  @UseGuards(CatalogWriteGuard)
  archiveProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.archiveProduct(id, request.authUser!.id)
  }

  @Post('products/:id/variants')
  @UseGuards(CatalogWriteGuard)
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateVariantDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.addVariant(id, input, request.authUser!.id)
  }

  @Patch('products/:id/variants/:variantId')
  @UseGuards(CatalogWriteGuard)
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() input: UpdateVariantDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.updateVariant(
      id,
      variantId,
      input,
      request.authUser!.id,
    )
  }

  @Delete('products/:id/variants/:variantId')
  @UseGuards(CatalogWriteGuard)
  deleteVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalog.deleteVariant(id, variantId, request.authUser!.id)
  }
}
