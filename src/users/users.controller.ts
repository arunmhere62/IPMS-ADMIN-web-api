import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (from JWT)' })
  @ApiResponse({ status: 200, description: 'Profile fetched successfully' })
  async getMe(@Req() req: Request) {
    const userId = (req as any).user?.sub;
    return this.service.findOne(Number(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'User fetched successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
