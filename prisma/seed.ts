import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  {
    id: "fashion",
    name: "Fashion",
    iconKey: "Shirt",
    sortOrder: 1,
  },
  {
    id: "electronics",
    name: "Electronics",
    iconKey: "Smartphone",
    sortOrder: 2,
  },
  {
    id: "food",
    name: "Food",
    iconKey: "Utensils",
    sortOrder: 3,
  },
  {
    id: "beauty",
    name: "Beauty",
    iconKey: "Sparkles",
    sortOrder: 4,
  },
  {
    id: "textiles",
    name: "Textiles",
    iconKey: "Layers",
    sortOrder: 5,
  },
  {
    id: "services",
    name: "Services",
    iconKey: "Wrench",
    sortOrder: 6,
  },
];

async function seedCategories() {
  for (const category of categories) {
    const existing = await prisma.category.findUnique({
      where: {
        name: category.name,
      },
    });

    if (existing) {
      await prisma.category.update({
        where: {
          id: existing.id,
        },
        data: {
          iconKey: category.iconKey,
          sortOrder: category.sortOrder,
          isActive: true,
        },
      });

      console.log(`Updated category: ${category.name}`);
      continue;
    }

    await prisma.category.create({
      data: {
        id: category.id,
        name: category.name,
        iconKey: category.iconKey,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });

    console.log(`Created category: ${category.name}`);
  }
}

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail) {
    throw new Error(
      "ADMIN_EMAIL environment variable is required."
    );
  }

  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD environment variable is required."
    );
  }

  if (adminPassword.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 8 characters long."
    );
  }

  const hashedPassword = await bcrypt.hash(
    adminPassword,
    12
  );

  const admin = await prisma.user.upsert({
    where: {
      email: adminEmail,
    },
    update: {
      password: hashedPassword,
      role: "ADMIN",
      name: "ReMarket Admin",
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      role: "ADMIN",
      name: "ReMarket Admin",
    },
  });

  console.log(`Admin account ready: ${admin.email}`);
}

async function main() {
  console.log("🌱 Starting ReMarket seed...");
  console.log("");

  await seedCategories();
  await seedAdmin();

  console.log("");
  console.log("=================================");
  console.log("🌱 ReMarket seed completed");
  console.log("=================================");
  console.log("No marketplace data was deleted.");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });