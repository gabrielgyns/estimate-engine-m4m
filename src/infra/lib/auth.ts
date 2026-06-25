import { betterAuth } from "better-auth"; // we can import from better-auth/minimal to reduce bundle.
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { db } from "@/infra/db";

export const auth = betterAuth({
  // trustedOrigins: ["http://localhost:3000", "https://example.com"],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    // Allow updating the account email. With no email-verification infra wired
    // up, an unverified email is changed directly (no confirmation mail).
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
    // Allow self-service account deletion. Password confirmation is enforced on
    // the client, so deletion happens immediately without a verification mail.
    deleteUser: {
      enabled: true,
    },
  },
  plugins: [username(), organization()],
});
