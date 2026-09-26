import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Lo ejecutan `prisma db seed` y `prisma migrate reset`
    seed: "node prisma/seed.js",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
