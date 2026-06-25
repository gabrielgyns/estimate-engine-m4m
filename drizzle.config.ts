import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("The DATABASE_URL env is required.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/db/schemas/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
