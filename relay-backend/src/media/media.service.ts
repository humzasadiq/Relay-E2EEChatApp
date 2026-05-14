import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(data: {
    uploadedBy: string;
    conversationId: string;
    encryptedBytes: Buffer;
    mime: string;
    size: number;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma.mediaAsset as any).create({
      data: {
        uploadedBy: data.uploadedBy,
        conversationId: data.conversationId,
        encryptedBytes: data.encryptedBytes,
        mime: data.mime,
        size: data.size,
      },
    });
  }

  async findOne(id: string, userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asset = await (this.prisma.mediaAsset as any).findUnique({ where: { id } }) as any;
    if (!asset) return null;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_conversationId: { userId, conversationId: asset.conversationId } },
    });
    if (!membership) return null;
    return asset;
  }
}
