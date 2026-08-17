import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { VariableResolverService } from './variable-resolver.service';
import { SendMessageDto } from './dto/send-message.dto';
import { PreviewMessageDto } from './dto/preview-message.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { ResponseUtil } from '../common/utils/response.util';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('Messages')
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly variableResolver: VariableResolverService,
  ) {}

  @Get('placeholders')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async getPlaceholders() {
    return ResponseUtil.success(
      this.variableResolver.getAvailablePlaceholders(),
      'Available placeholders retrieved successfully',
    );
  }

  @Post('preview')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async preview(
    @Body() dto: PreviewMessageDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.messagesService.preview(dto, parseInt(userId, 10));
  }

  @Post('send')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGES.SEND))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async send(
    @Body() dto: SendMessageDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.messagesService.send(dto, parseInt(userId, 10));
  }

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
  ) {
    return this.messagesService.findAll({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      entity_type: entityType,
      entity_id: entityId ? parseInt(entityId, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.MESSAGES.VIEW))
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.messagesService.findOne(id);
  }
}
