import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Run with: node --env-file=.env.local scripts/migrate.mjs");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schemaPath = join(__dirname, "..", "db", "schema.sql");
const schema = readFileSync(schemaPath, "utf-8");

try {
  await pool.query(schema);
  console.log("Migration applied successfully.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
