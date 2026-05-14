import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';

const MAX_FILE_BYTES = 5 * 1024 * 1024 + 512;

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  async upload(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number },
    @Body() body: { conversationId: string; mime: string; size: string },
  ) {
    const asset = await this.media.upload({
      uploadedBy: user.sub,
      conversationId: body.conversationId,
      encryptedBytes: file.buffer,
      mime: body.mime,
      size: parseInt(body.size, 10),
    });
    return { id: asset.id };
  }

  @Get(':id')
  async download(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const asset = await this.media.findOne(id, user.sub);
    if (!asset) throw new NotFoundException();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bytes = (asset as any).encryptedBytes as Buffer;
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(bytes);
  }
}
