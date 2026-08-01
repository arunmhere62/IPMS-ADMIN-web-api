import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidation');

const REQUIRED_VARS = [
  'DATABASE_CONSUMER_URL',
  'DATABASE_MANAGEMENT_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

const CONDITIONAL_VARS: Record<string, string> = {
  AWS_ACCESS_KEY_ID: 'Required for S3 file uploads',
  AWS_SECRET_ACCESS_KEY: 'Required for S3 file uploads',
  AWS_REGION: 'Required for S3 file uploads',
  AWS_S3_BUCKET_NAME: 'Required for S3 file uploads',
};

export function validateEnvironment(): { valid: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  for (const [varName, description] of Object.entries(CONDITIONAL_VARS)) {
    if (!process.env[varName]) {
      warnings.push(`${varName} - ${description}`);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    warnings.push('JWT_SECRET is too short (min 16 characters recommended)');
  }

  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 16) {
    warnings.push('JWT_REFRESH_SECRET is too short (min 16 characters recommended)');
  }

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    return { valid: false, missing, warnings };
  }

  if (warnings.length > 0) {
    logger.warn(`Environment warnings:\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
  }

  logger.log('Environment validation passed');
  return { valid: true, missing, warnings };
}
