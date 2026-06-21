import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// `dotenv`'s default `import 'dotenv/config'` only loads a file named
// `.env`. Our app keeps secrets in `.env.local` (the Next.js convention),
// so we load that explicitly here for the Prisma CLI (generate/db push/studio).
config({ path: '.env.local' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
})