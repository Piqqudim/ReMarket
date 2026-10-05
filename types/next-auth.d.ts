import NextAuth from "next-auth";

type ReMarketRole =
  | "ADMIN"
  | "SELLER"
  | "BUYER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: ReMarketRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    role: ReMarketRole;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    id: string;
    role: ReMarketRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: ReMarketRole;
  }
}