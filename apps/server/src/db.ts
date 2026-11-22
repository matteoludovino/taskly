import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export type Db = PrismaClient;

/** Prisma without the Rust engine: queries go through node-postgres (lighter on a 512 MB instance). */
export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}
