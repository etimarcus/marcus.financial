import "server-only";
import { Pool } from "@neondatabase/serverless";

declare global {
  var __marcusFinancialPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({ connectionString });
}

export const db: Pool = globalThis.__marcusFinancialPool ?? makePool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__marcusFinancialPool = db;
}
