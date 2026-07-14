import { Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user';

/* Notifications screen (§5.9). Users see their own; admin/cio see the full log. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const seeAll = user.roles.includes('admin') || user.roles.includes('cio');
    const rows = await this.prisma.notification.findMany({
      where: seeAll ? {} : { toUserId: user.id },
      orderBy: { sentAt: 'desc' },
      take: 200,
    });
    return rows;
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    const count = await this.prisma.notification.count({ where: { toUserId: user.id, read: false } });
    return { count };
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { id, toUserId: user.id }, data: { read: true } });
    return { ok: true };
  }
}
