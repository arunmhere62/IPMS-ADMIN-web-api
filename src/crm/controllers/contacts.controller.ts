import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Controller('crm/contacts')
export class ContactsController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  async list(@Query() q: any) {
    const [items, total] = await this.crm.listContacts(q);
    return ResponseUtil.paginated(items, total, Number(q.page ?? 1), Number(q.limit ?? 20));
  }

  @Post()
  async create(@Body() body: any) {
    const contact = await this.crm.createContact(body);
    return ResponseUtil.created(contact, 'Contact created');
  }

  @Post('bulk-import')
  async bulkImport(@Body() body: any) {
    const result = await this.crm.bulkImportContacts(body.rows ?? [], body.filename ?? 'manual_upload.xlsx', body.uploaded_by);
    // Build a clear, always-present message from the result
    const parts: string[] = [];
    if (result.imported > 0) {
      parts.push(`Imported ${result.imported} of ${result.total} contacts`);
    } else {
      parts.push(`Imported 0 of ${result.total} contacts`);
    }
    if (result.duplicates) parts.push(`${result.duplicates} duplicates skipped`);
    if (result.failed) parts.push(`${result.failed} failed`);
    if (result.imported === 0 && result.duplicates === 0 && result.failed === 0) {
      parts.push('No rows processed');
    }
    return ResponseUtil.success(result, parts.join(', '));
  }

  @Post('check-duplicates')
  async checkDuplicates(@Body() body: any) {
    const result = await this.crm.checkDuplicates(body.rows ?? []);
    return ResponseUtil.success(result, `Found ${result.duplicates} duplicate(s) of ${result.total} row(s)`);
  }

  @Post('bulk-convert-lead')
  async bulkConvertToLead(@Body() body: any) {
    const result = await this.crm.bulkConvertContactsToLead(body.contact_ids ?? [], body.assigned_to);
    return ResponseUtil.success(result, `Converted ${result.converted} of ${result.total} contacts${result.skipped ? `, ${result.skipped} already converted` : ''}`);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const data = await this.crm.getContact(Number(id));
    return ResponseUtil.success(data);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const data = await this.crm.updateContact(Number(id), body);
    return ResponseUtil.success(data, 'Contact updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const data = await this.crm.softDeleteContact(Number(id));
    return ResponseUtil.success(data, 'Contact deleted');
  }

  @Post(':id/convert-lead')
  async convertToLead(@Param('id') id: string, @Body() body: any) {
    const lead = await this.crm.convertContactToLead(Number(id), body?.assigned_to);
    return ResponseUtil.created(lead, 'Converted to lead');
  }
}
