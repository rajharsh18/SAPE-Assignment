import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { department: true },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        if (user.deletedAt) {
          throw new Error("Account has been deactivated");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );

        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          departmentName: user.department?.name || null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          role: string;
          departmentId: string | null;
          departmentName: string | null;
        };
        token.role = u.role;
        token.departmentId = u.departmentId;
        token.departmentName = u.departmentName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as unknown as Record<string, unknown>;
        s.id = token.sub;
        s.role = token.role;
        s.departmentId = token.departmentId;
        s.departmentName = token.departmentName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
};

export default NextAuth(authOptions);
