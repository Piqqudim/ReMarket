// lib/auth.ts

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/admin/login",
  },

  providers: [
    CredentialsProvider({
      name: "credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        if (
          !credentials?.email ||
          !credentials?.password
        ) {
          return null;
        }

        const email =
          credentials.email
            .trim()
            .toLowerCase();

        const user =
          await prisma.user.findUnique({
            where: {
              email,
            },
          });

        if (!user) {
          return null;
        }

        const passwordValid =
          await bcrypt.compare(
            credentials.password,
            user.password
          );

        if (!passwordValid) {
          return null;
        }

        /*
         * ADMIN, SELLER, and BUYER users
         * are all allowed to authenticate.
         *
         * Individual protected APIs/routes
         * are responsible for checking the
         * user's role before allowing access.
         */
        if (
          user.role !== "ADMIN" &&
          user.role !== "SELLER" &&
          user.role !== "BUYER"
        ) {
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
    async jwt({
      token,
      user,
    }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },

    async session({
      session,
      token,
    }) {
      if (
        session.user &&
        token.id
      ) {
        session.user.id =
          token.id as string;
      }

      if (
        session.user &&
        token.role
      ) {
        session.user.role =
          token.role as
            | "ADMIN"
            | "SELLER"
            | "BUYER";
      }

      return session;
    },
  },
};