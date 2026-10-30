import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { MediaService } from './media.service'

@ApiTags('Media / Disk')
@Controller('media')
export class DiskMediaController {
  constructor(private readonly media: MediaService) {}

  @Put('disk-uploads/:id')
  @ApiOperation({
    summary:
      'VPS only: signed raw binary PUT (short-lived header token; no bearer JWT needed)',
    description:
      'Call POST /v1/admin/media/uploads with an authorized staff Bearer JWT first, then PUT the raw JPEG/PNG/WebP bytes here with the returned X-Media-Upload-Token and Content-Type. This endpoint does not accept a JSON/multipart body. Finalize via POST /v1/admin/media/{id}/complete.',
  })
  @ApiConsumes('image/png', 'image/jpeg', 'image/webp')
  @ApiHeader({
    name: 'X-Media-Upload-Token',
    required: true,
    description: 'Short-lived token from signed upload instruction',
  })
  @ApiHeader({
    name: 'Content-Length',
    required: true,
    description: 'Raw file size in bytes (max 10 MiB)',
  })
  @ApiBody({ required: true, schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({
    description: 'Disk file stored; finalize media via admin /complete.',
  })
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-media-upload-token') token: string | undefined,
    @Headers('content-type') mimeType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: Request,
  ) {
    // Bound idle signed-upload requests; partial files are removed in provider.finally.
    req.setTimeout(30_000, () => req.destroy())
    return this.media.uploadToDisk(
      id,
      token ?? '',
      (mimeType ?? '').split(';')[0]!.trim(),
      Number(contentLength ?? NaN),
      req,
    )
  }

  @Get('files/:id')
  @ApiOperation({
    summary:
      'Read verified VPS image attached to an active public product or store brand',
  })
  @ApiOkResponse({
    description:
      'Raw JPEG/PNG/WebP image bytes; ?width=320/480/... returns READY WebP',
  })
  @ApiQuery({
    name: 'width',
    required: false,
    type: Number,
    description: 'Generated rendition width; only READY widths are public',
  })
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @Query('width') width?: string,
  ) {
    const parsed = width === undefined ? undefined : Number(width)
    if (
      width !== undefined &&
      (!/^(320|480|640|960|1280|1600)$/.test(width) ||
        !Number.isInteger(parsed))
    )
      throw new BadRequestException('Invalid rendition width')
    const { stream, mimeType } = await this.media.readPublishedDiskImage(
      id,
      parsed,
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Cache-Control', 'public, max-age=60')
    return new StreamableFile(stream, { type: mimeType, disposition: 'inline' })
  }
}
