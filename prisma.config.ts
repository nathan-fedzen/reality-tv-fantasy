import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations should use DIRECT_URL when available; fallback keeps local setup working.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
