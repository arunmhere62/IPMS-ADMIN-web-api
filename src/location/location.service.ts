import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client-consumer';
import { ConsumerPrismaService } from '../prisma/consumer-prisma.service';
import { ResponseUtil } from '../common/utils/response.util';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(private prisma: ConsumerPrismaService) {}

  async getCountries() {
    try {
      const countries = await this.prisma.country.findMany({
        select: {
          s_no: true,
          name: true,
          iso_code: true,
          flag: true,
          phone_code: true,
          currency: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { name: 'asc' },
      });
      return ResponseUtil.success(countries, 'Countries fetched successfully');
    } catch {
      throw new BadRequestException('Failed to fetch countries');
    }
  }

  async getCountryByCode(isoCode: string) {
    if (!isoCode) throw new BadRequestException('isoCode is required');
    try {
      const country = await this.prisma.country.findUnique({
        where: { iso_code: isoCode },
        select: {
          s_no: true,
          name: true,
          iso_code: true,
          flag: true,
          phone_code: true,
          currency: true,
          latitude: true,
          longitude: true,
        },
      });
      if (!country) throw new BadRequestException('Country not found');
      return ResponseUtil.success(country, 'Country fetched successfully');
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to fetch country');
    }
  }

  async getStatesByCountry(countryCode: string) {
    if (!countryCode) throw new BadRequestException('countryCode is required');
    try {
      const states = await this.prisma.state.findMany({
        where: { country_code: countryCode },
        select: {
          s_no: true,
          name: true,
          iso_code: true,
          country_code: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { name: 'asc' },
      });
      return ResponseUtil.success(states, 'States fetched successfully');
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to fetch states');
    }
  }

  async getStateById(id: number) {
    if (!id) throw new BadRequestException('stateId is required');
    try {
      const state = await this.prisma.state.findUnique({
        where: { s_no: id },
        select: {
          s_no: true,
          name: true,
          iso_code: true,
          country_code: true,
          latitude: true,
          longitude: true,
          country: { select: { name: true, iso_code: true } },
        },
      });
      if (!state) throw new BadRequestException('State not found');
      return ResponseUtil.success(state, 'State fetched successfully');
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to fetch state');
    }
  }

  async getCitiesByState(stateCode: string) {
    if (!stateCode) throw new BadRequestException('stateCode is required');
    try {
      const cities = await this.prisma.city.findMany({
        where: { state_code: stateCode },
        select: {
          s_no: true,
          name: true,
          country_code: true,
          state_code: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { name: 'asc' },
      });
      return ResponseUtil.success(cities, 'Cities fetched successfully');
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to fetch cities');
    }
  }

  async getCityById(id: number) {
    if (!id) throw new BadRequestException('cityId is required');
    try {
      const city = await this.prisma.city.findUnique({
        where: { s_no: id },
        select: {
          s_no: true,
          name: true,
          country_code: true,
          state_code: true,
          latitude: true,
          longitude: true,
        },
      });
      if (!city) throw new BadRequestException('City not found');
      return ResponseUtil.success(city, 'City fetched successfully');
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Failed to fetch city');
    }
  }

  async validateCities(names: string[]) {
    const trimmed = names.map((n) => n.trim()).filter(Boolean);
    const unique = [...new Set(trimmed.map((n) => n.toLowerCase()))];

    if (!unique.length) {
      return { valid: [], invalid: [] };
    }

    try {
      const cities = (await this.prisma.$queryRaw(
        Prisma.sql`
          SELECT s_no, name, state_code, country_code
          FROM city
          WHERE LOWER(name) IN (${Prisma.join(unique)})
        `,
      )) as { s_no: number; name: string; state_code: string; country_code: string }[];

      const stateCodes = [...new Set(cities.map((c) => c.state_code).filter(Boolean))];
      const countryCodes = [...new Set(cities.map((c) => c.country_code).filter(Boolean))];

      const [states, countries] = await Promise.all([
        stateCodes.length
          ? this.prisma.state.findMany({
              where: { iso_code: { in: stateCodes } },
              select: { iso_code: true, name: true },
            })
          : Promise.resolve([]),
        countryCodes.length
          ? this.prisma.country.findMany({
              where: { iso_code: { in: countryCodes } },
              select: { iso_code: true, name: true },
            })
          : Promise.resolve([]),
      ]);

      const stateMap = new Map(states.map((s) => [s.iso_code, s.name]));
      const countryMap = new Map(countries.map((c) => [c.iso_code, c.name]));

      const matchedNames = new Set(cities.map((c) => c.name.toLowerCase()));
      const valid = cities.map((c) => ({
        s_no: c.s_no,
        name: c.name,
        state_code: c.state_code,
        state: stateMap.get(c.state_code) ?? c.state_code,
        country_code: c.country_code,
        country: countryMap.get(c.country_code) ?? c.country_code,
      }));

      const invalid = unique
        .filter((name) => !matchedNames.has(name))
        .map((name) => ({ name }));

      return { valid, invalid };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`validateCities failed: ${errorMessage}`, errorStack);
      throw err;
    }
  }
}
