import { LoggerService, LogLevel } from '@nestjs/common';

type LogEntry = {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  meta?: any;
};

export class AppLogger implements LoggerService {
  private static instance: AppLogger;
  private minLevel: number;
  private isProduction: boolean;
  private readonly levels: Record<string, number> = {
    verbose: 0,
    debug: 1,
    log: 2,
    warn: 3,
    error: 4,
  };

  private constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() || (this.isProduction ? 'log' : 'debug');
    this.minLevel = this.levels[envLevel] ?? this.levels.log;
  }

  static getInstance(): AppLogger {
    if (!AppLogger.instance) {
      AppLogger.instance = new AppLogger();
    }
    return AppLogger.instance;
  }

  log(message: any, context?: string) {
    this.write('log', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: any, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: any, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: any, context?: string) {
    this.write('verbose', message, context);
  }

  private write(level: string, message: any, context?: string, trace?: string) {
    if (this.levels[level] < this.minLevel) return;

    const contextStr = context || 'App';
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

    if (this.isProduction) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        context: contextStr,
        message: messageStr,
      };
      if (trace) entry.meta = { trace };

      if (level === 'error') {
        process.stderr.write(JSON.stringify(entry) + '\n');
      } else {
        process.stdout.write(JSON.stringify(entry) + '\n');
      }
    } else {
      const ts = new Date().toISOString().split('T')[1].split('.')[0];
      const levelTag = level.toUpperCase().padEnd(7);
      const line = `[${ts}] ${levelTag} [${contextStr}] ${messageStr}`;
      if (trace) {
        if (level === 'error') {
          console.error(line);
          console.error(trace);
        } else {
          console.log(line);
          console.log(trace);
        }
      } else {
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
      }
    }
  }
}
