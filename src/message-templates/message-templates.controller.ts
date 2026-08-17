import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessageTemplatesService } from './message-templates.service';
import { ListMessageTemplatesDto } from './dto/list-message-templates.dto';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('Message Templates')
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly messageTemplatesService: MessageTemplatesService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGE_TEMPLATES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async findAll(@Query() query: ListMessageTemplatesDto) {
    return this.messageTemplatesService.findAll(query);
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGE_TEMPLATES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.messageTemplatesService.findOne(id);
  }

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGE_TEMPLATES.CREATE))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async create(@Body() dto: CreateMessageTemplateDto) {
    return this.messageTemplatesService.create(dto);
  }

  @Put(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGE_TEMPLATES.UPDATE))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMessageTemplateDto,
  ) {
    return this.messageTemplatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGE_TEMPLATES.DELETE))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.messageTemplatesService.remove(id);
  }
}
