import { Controller, Get } from '@nestjs/common';

@Controller('media')
export class MediaController {
  @Get('health')
  health() {
    return { ok: true };
  }
  // M5 lands signed Cloudinary uploads.
}
