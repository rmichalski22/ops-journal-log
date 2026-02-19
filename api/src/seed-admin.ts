import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

export async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@localhost";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin user already exists:", email);
    return;
  }

  const hash = await argon2.hash(password);
  await prisma.user.create({
    data: { email, passwordHash: hash, role: "admin" },
  });
  console.log("Created admin user:", email);
  await prisma.$disconnect();
}
