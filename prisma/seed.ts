import "dotenv/config";
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

async function main() {
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

  console.log("ReMarket category seed completed.");
}

main()
  .catch((error) => {
    console.error("Category seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });