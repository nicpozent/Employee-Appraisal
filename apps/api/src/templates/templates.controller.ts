import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { Roles } from '../auth/roles.decorator';

interface SectionDto { id?: string; title: string; type: string; weight: number; fields: { id?: string; label: string }[] }
interface TemplateDto { name: string; scope: string; icon?: string; color?: string; desc?: string; sections: SectionDto[] }

/* Templates (§5.6/5.7) — admin, manager, cto, cio. */
@Controller('templates')
@Roles('admin', 'it_manager', 'cto', 'cio')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private include = { sections: { include: { fields: { orderBy: { order: 'asc' as const } } }, orderBy: { order: 'asc' as const } } };

  @Get()
  list() {
    return this.prisma.template.findMany({ include: this.include, orderBy: [{ system: 'desc' }, { name: 'asc' }] });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const t = await this.prisma.template.findUnique({ where: { id }, include: this.include });
    if (!t) throw new NotFoundException();
    return t;
  }

  private validate(dto: TemplateDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    const total = dto.sections.reduce((s, sec) => s + (Number(sec.weight) || 0), 0);
    if (total !== 100) throw new BadRequestException(`Weights must total 100% (got ${total}%)`);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: TemplateDto) {
    this.validate(dto);
    const t = await this.prisma.template.create({
      data: {
        name: dto.name, scope: dto.scope, icon: dto.icon, color: dto.color, desc: dto.desc,
        system: false, createdBy: user.id,
        sections: { create: dto.sections.map((s, si) => ({
          title: s.title, type: s.type, weight: s.weight, order: si,
          fields: { create: s.fields.map((f, fi) => ({ label: f.label, order: fi })) },
        })) },
      },
      include: this.include,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'TEMPLATE.UPDATE', objectRef: `template:${t.id}` });
    return t;
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TemplateDto) {
    this.validate(dto);
    const existing = await this.prisma.template.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.system) throw new BadRequestException('System templates cannot be edited; duplicate first');
    // Replace sections wholesale for simplicity.
    await this.prisma.section.deleteMany({ where: { templateId: id } });
    const t = await this.prisma.template.update({
      where: { id },
      data: {
        name: dto.name, scope: dto.scope, icon: dto.icon, color: dto.color, desc: dto.desc,
        sections: { create: dto.sections.map((s, si) => ({
          title: s.title, type: s.type, weight: s.weight, order: si,
          fields: { create: s.fields.map((f, fi) => ({ label: f.label, order: fi })) },
        })) },
      },
      include: this.include,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'TEMPLATE.UPDATE', objectRef: `template:${id}` });
    return t;
  }

  @Post(':id/duplicate')
  async duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const src = await this.prisma.template.findUnique({ where: { id }, include: this.include });
    if (!src) throw new NotFoundException();
    const t = await this.prisma.template.create({
      data: {
        name: `${src.name} (custom)`, scope: src.scope, icon: src.icon, color: src.color, desc: src.desc,
        system: false, createdBy: user.id,
        sections: { create: src.sections.map((s) => ({
          title: s.title, type: s.type, weight: s.weight, order: s.order,
          fields: { create: s.fields.map((f) => ({ label: f.label, order: f.order })) },
        })) },
      },
      include: this.include,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'TEMPLATE.UPDATE', objectRef: `template:${t.id}` });
    return t;
  }
}
