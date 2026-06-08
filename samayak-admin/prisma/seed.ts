import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  const hashedPassword = await bcrypt.hash(
    process.env.DEMO_ADMIN_PASSWORD || "samayak2026",
    12
  );

  await prisma.user.upsert({
    where: { email: process.env.DEMO_ADMIN_EMAIL || "admin@samayak.demo" },
    update: { passwordHash: hashedPassword },
    create: {
      name: "Demo Admin",
      email: process.env.DEMO_ADMIN_EMAIL || "admin@samayak.demo",
      passwordHash: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log("✅ Demo admin created");
  console.log("🎉 Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
