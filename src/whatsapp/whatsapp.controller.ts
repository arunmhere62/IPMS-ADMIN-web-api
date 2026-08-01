import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WhatsAppService } from './whatsapp.service';
import { SendWhatsAppMessageDto } from './dto/send-message.dto';
import { CreateWhatsAppTemplateDto } from './dto/create-template.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Send a WhatsApp message (manual link or API)' })
  @ApiResponse({ status: 200, description: 'Message sent or link generated' })
  async sendMessage(
    @Body() dto: SendWhatsAppMessageDto,
    @Headers('user_id') userId: string,
  ) {
    return this.whatsappService.sendMessage(dto, parseInt(userId, 10));
  }

  @Get('messages')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Get WhatsApp message history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: Number })
  @ApiQuery({ name: 'phone', required: false, type: String })
  async getMessages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('phone') phone?: string,
  ) {
    return this.whatsappService.getMessageHistory({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      entityType: entityType || undefined,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      phone: phone || undefined,
    });
  }

  // Template endpoints
  @Post('templates')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Create a WhatsApp message template' })
  async createTemplate(@Body() dto: CreateWhatsAppTemplateDto) {
    return this.whatsappService.createTemplate(dto);
  }

  @Get('templates')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'List all WhatsApp templates' })
  async listTemplates() {
    return this.whatsappService.listTemplates();
  }

  @Get('templates/:id')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Get a single template' })
  @ApiParam({ name: 'id', type: Number })
  async getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.whatsappService.getTemplate(id);
  }

  @Delete('templates/:id')
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  @ApiOperation({ summary: 'Delete a template (soft delete)' })
  @ApiParam({ name: 'id', type: Number })
  async deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.whatsappService.deleteTemplate(id);
  }

  // Meta webhook verification & events
  @Get('webhook')
  @ApiOperation({ summary: 'Meta webhook verification endpoint' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsapp_verify_token';
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return 'Verification failed';
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Meta webhook event receiver for delivery status' })
  async webhookEvent(@Body() body: any) {
    return this.whatsappService.handleWebhook(body);
  }
}
