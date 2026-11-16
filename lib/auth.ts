import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";

const VALID_ROLES = ["ADMIN", "SELLER", "BUYER"] as const;
type AuthRole = (typeof VALID_ROLES)[number];

function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === "string" && VALID_ROLES.includes(value as AuthRole);
}

function unauthenticatedSession(session: unknown) {
  const current = session as { expires?: string };
  return { expires: current.expires };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const email = credentials.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            password: true,
            name: true,
            role: true,
            accountStatus: true,
          },
        });

        if (!user) return null;
        const passwordValid = await bcrypt.compare(credentials.password, user.password);
        if (!passwordValid || !isAuthRole(user.role)) return null;

        // Suspended buyer and seller accounts cannot start new sessions.
        if ((user.role === "BUYER" || user.role === "SELLER") && user.accountStatus !== "ACTIVE") {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        delete token.authError;
      }

      const userId = typeof token.id === "string" ? token.id : null;
      const role = token.role;

      // Re-check buyer and seller status whenever NextAuth evaluates the JWT.
      if (userId && (role === "BUYER" || role === "SELLER")) {
        const account = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, accountStatus: true },
        });

        if (!account || account.role !== role || account.accountStatus !== "ACTIVE") {
          // NextAuth v4 requires jwt() to return a JWT, not null.
          // Remove identity claims so ID/role-based route guards reject this token.
          delete token.id;
          delete token.role;
          delete token.sub;
          delete token.name;
          delete token.email;
          delete token.picture;
          token.authError = account?.accountStatus === "SUSPENDED"
            ? "ACCOUNT_SUSPENDED"
            : "ACCOUNT_UNAVAILABLE";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.authError || typeof token.id !== "string" || !isAuthRole(token.role)) {
        // Return an expiry-only session with no authenticated user identity.
        return unauthenticatedSession(session) as typeof session;
      }

      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }

      return session;
    },
  },
};
