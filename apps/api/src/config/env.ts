import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).optional(),
  NOVEL_ASYNC_DISPATCH_DEV_ENABLED: z.enum(['true', 'false']).default('false'),
  NOVEL_ASYNC_SCOPE_SECRET: z.string().optional(),
  NOVEL_ASYNC_API_AUDIENCE: z.string().optional(),
  DEPLOYMENT_ACTOR_TENANT_ID: z.string().trim().min(1).optional(),
  DEPLOYMENT_ACTOR_USER_ID: z.string().trim().min(1).optional()
});

export const env = envSchema.parse(process.env);
