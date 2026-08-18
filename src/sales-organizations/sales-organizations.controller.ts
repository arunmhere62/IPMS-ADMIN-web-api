import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SalesOrganizationsService } from './sales-organizations.service';
import { CreateSalesOrganizationDto } from './dto/create-sales-organization.dto';
import { UpdateSalesOrganizationDto } from './dto/update-sales-organization.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { HeadersValidationGuard } from '../common/guards/headers-validation.guard';
import { RequireHeaders } from '../common/decorators/require-headers.decorator';
import { RequirePermission } from '../common/rbac/require-permission.decorator';
import { ADMIN_PERMISSIONS, permissionKey } from '../common/rbac/permissions.catalog';

@ApiTags('sales-organizations')
@Controller('sales-organizations')
@UseGuards(HeadersValidationGuard)
@RequireHeaders({ user_id: true })
export class SalesOrganizationsController {
  constructor(private readonly service: SalesOrganizationsService) {}

  @Get()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'List sales organizations with employee counts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Sales organizations fetched successfully' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.service.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search: search || undefined,
      status: status || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined,
    });
  }

  @Get('active')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'List active sales organizations (for dropdowns)' })
  @ApiResponse({ status: 200, description: 'Active sales organizations fetched successfully' })
  async findAllActive() {
    return this.service.findAllActive();
  }

  @Get(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'Get sales organization by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Sales organization fetched successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/roles-status')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'Get role assignment status for an org (has PARTNER_ADMIN, available roles)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Role status fetched successfully' })
  getRolesStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.getRolesStatus(id);
  }

  @Get(':id/employees')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.VIEW))
  @ApiOperation({ summary: 'List employees (users) of a sales organization' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Employees fetched successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization not found' })
  async findEmployees(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findEmployees(id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search: search || undefined,
    });
  }

  @Post()
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.CREATE))
  @ApiOperation({ summary: 'Create a new sales organization' })
  @ApiResponse({ status: 201, description: 'Sales organization created successfully' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  async create(@Body() dto: CreateSalesOrganizationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.UPDATE))
  @ApiOperation({ summary: 'Update sales organization (name, description)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Sales organization updated successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesOrganizationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.UPDATE))
  @ApiOperation({ summary: 'Deactivate a sales organization (sets status=INACTIVE)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Sales organization deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization not found' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.service.deactivate(id);
  }

  @Post(':id/reactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.ORGANIZATIONS.UPDATE))
  @ApiOperation({ summary: 'Reactivate a sales organization (sets status=ACTIVE)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Sales organization reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization not found' })
  async reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.service.reactivate(id);
  }

  // ─── Employee (user) management, scoped to a sales organization ───

  @Post(':id/employees')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.USERS.CREATE))
  @ApiOperation({ summary: 'Create a new employee (user) in a sales organization' })
  @ApiParam({ name: 'id', type: Number, description: 'Sales organization ID' })
  @ApiResponse({ status: 201, description: 'Employee created successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization or role not found' })
  @ApiResponse({ status: 409, description: 'Email or phone already exists' })
  async createEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.service.createEmployee(id, dto);
  }

  @Patch(':id/employees/:userId')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.USERS.UPDATE))
  @ApiOperation({ summary: 'Update an employee within a sales organization' })
  @ApiParam({ name: 'id', type: Number, description: 'Sales organization ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'Employee (user) ID' })
  @ApiResponse({ status: 200, description: 'Employee updated successfully' })
  @ApiResponse({ status: 404, description: 'Sales organization or employee not found' })
  async updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.updateEmployee(id, userId, dto);
  }

  @Post(':id/employees/:userId/deactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.USERS.UPDATE))
  @ApiOperation({ summary: 'Deactivate an employee' })
  @ApiParam({ name: 'id', type: Number, description: 'Sales organization ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'Employee (user) ID' })
  @ApiResponse({ status: 200, description: 'Employee deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  async deactivateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.deactivateEmployee(id, userId);
  }

  @Post(':id/employees/:userId/reactivate')
  @RequirePermission(permissionKey(ADMIN_PERMISSIONS.USERS.UPDATE))
  @ApiOperation({ summary: 'Reactivate an employee' })
  @ApiParam({ name: 'id', type: Number, description: 'Sales organization ID' })
  @ApiParam({ name: 'userId', type: Number, description: 'Employee (user) ID' })
  @ApiResponse({ status: 200, description: 'Employee reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  async reactivateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.reactivateEmployee(id, userId);
  }
}
