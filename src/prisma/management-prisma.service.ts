import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client-management';
import { addDbTiming } from '../common/utils/performance-context';

const globalForManagementPrisma = global as unknown as {
  managementPrisma?: ManagementPrismaService;
};

@Injectable()
export class ManagementPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ManagementPrismaService.name);
  private isConnected = false;

  constructor() {
    const existing = globalForManagementPrisma.managementPrisma;
    if (existing) {
      return existing;
    }

    super({
      datasources: {
        db: {
          url: process.env.DATABASE_MANAGEMENT_URL,
        },
      },
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.$use(async (params, next) => {
      const start = process.hrtime.bigint();
      try {
        const result = await next(params);
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1_000_000;
        addDbTiming(ms);
        return result;
      } catch (error: any) {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1_000_000;
        addDbTiming(ms);
        this.logger.error(
          `DB query failed (${ms.toFixed(0)}ms): ${params.model}.${params.action} - ${error?.code || error?.message}`,
        );
        throw error;
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForManagementPrisma.managementPrisma = this;
    }
  }

  async onModuleInit() {
    if (!process.env.DATABASE_MANAGEMENT_URL) {
      throw new Error('DATABASE_MANAGEMENT_URL is not set');
    }

    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('Database disconnected');
    }
  }

  private async connectWithRetry(maxRetries = 5, delayMs = 3000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.isConnected = true;
        this.logger.log(`Database connected (attempt ${attempt}/${maxRetries})`);
        return;
      } catch (error: any) {
        this.logger.error(
          `DB connection attempt ${attempt}/${maxRetries} failed: ${error?.message}`,
        );
        if (attempt === maxRetries) {
          throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
