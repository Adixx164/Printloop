import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.string().default('3306'),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_NAME: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for security'),
  PAYSTACK_SECRET_KEY: z.string().startsWith('sk_', 'Paystack secret key must start with sk_'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

export function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      console.error(`  - ${key}: ${errors.join(', ')}`);
    }
    process.exit(1);
  }
  
  return parsed.data;
}

export const env = process.env as unknown as z.infer<typeof envSchema>;
