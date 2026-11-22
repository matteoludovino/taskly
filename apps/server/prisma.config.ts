import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile(".env");

// Migrations need a direct connection: Neon's pooled URL (PgBouncer, transaction mode) can't hold the
// advisory lock `migrate deploy` takes. The app itself connects through DATABASE_URL (pooled).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] },
});
