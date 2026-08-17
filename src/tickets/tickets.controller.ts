import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { CommonHeaders, CommonHeadersDecorator } from '../common/decorators/common-headers.decorator';
import { TicketsService } from './tickets.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddTicketCommentDto } from './dto/add-ticket-comment.dto';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.TICKETS.VIEW))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List tickets (product team)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Tickets fetched successfully' })
  async getTickets(
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
  ) {
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    return this.ticketsService.getTickets({
      page,
      limit,
      status,
      category,
      priority,
      search,
    });
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.TICKETS.VIEW))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get ticket by ID (product team)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Ticket fetched successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicketById(@Param('id', ParseIntPipe) id: number) {
    return this.ticketsService.getTicketById(id);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.TICKETS.UPDATE))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ticket (status/resolution) (product team)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  async updateTicket(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketDto) {
    return this.ticketsService.updateTicket(id, dto);
  }

  @Post(':id/comments')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.TICKETS.UPDATE))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add comment to ticket (product team)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  async addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddTicketCommentDto,
    @CommonHeadersDecorator() headers: CommonHeaders,
  ) {
    return this.ticketsService.addComment(id, dto, headers.user_id);
  }
}
