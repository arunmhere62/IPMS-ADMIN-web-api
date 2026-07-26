import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { LocationService } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('countries')
  async getCountries() {
    return this.locationService.getCountries();
  }

  @Get('countries/:isoCode')
  async getCountryByCode(@Param('isoCode') isoCode: string) {
    return this.locationService.getCountryByCode(isoCode);
  }

  @Get('states')
  async getStatesByCountry(@Query('countryCode') countryCode: string) {
    return this.locationService.getStatesByCountry(countryCode);
  }

  @Get('states/:id')
  async getStateById(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.getStateById(id);
  }

  @Get('cities')
  async getCitiesByState(@Query('stateCode') stateCode: string) {
    return this.locationService.getCitiesByState(stateCode);
  }

  @Get('cities/:id')
  async getCityById(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.getCityById(id);
  }
}
