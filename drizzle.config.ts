import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./db/schema.ts", out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://username:password@localhost:5432/sic_pizza_dev" }, strict: true });
