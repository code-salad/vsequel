import '@dotenvx/dotenvx/config';
import z from 'zod';

export const EnvSchema = z.object({
  POSTGRES_URL: z
    .string()
    .default('postgresql://dbuser:dbpassword@localhost:5432/reflect_erd'),
  MYSQL_URL: z
    .string()
    .default('mysql://root:rootpassword@localhost:3306/reflect_erd'),
});

export const env = EnvSchema.parse(process.env);
