import { betterAuth } from "better-auth"; // we can import from better-auth/minimal to reduce bundle.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { db } from "@/db";

export const auth = betterAuth({
  // trustedOrigins: ["http://localhost:3000", "https://example.com"],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [username(), organization()],
});
