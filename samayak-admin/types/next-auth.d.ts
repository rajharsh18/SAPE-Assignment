import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      departmentId: string | null;
      departmentName: string | null;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    departmentId: string | null;
    departmentName: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    departmentId: string | null;
    departmentName: string | null;
  }
}
