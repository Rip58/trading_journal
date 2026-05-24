// Prisma 7: All connection URLs are configured here, NOT in schema.prisma
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use the UNPOOLED (direct) connection for Prisma CLI (migrations, introspection)
    url: process.env.DATABASE_URL_UNPOOLED,
  },
});
