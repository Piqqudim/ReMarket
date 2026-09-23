
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("🧹 Cleaning existing marketplace data...");

  // --------------------------------------------------
  // 1. DELETE MARKETPLACE DATA
  // --------------------------------------------------

  // Products depend on businesses/categories
  await prisma.product.deleteMany({});

  // Business social links depend on businesses
  await prisma.businessSocialLink.deleteMany({});

  // Business-category relations depend on businesses/categories
  await prisma.businessCategory.deleteMany({});

  // Businesses depend on locations
  await prisma.business.deleteMany({});

  // Categories and locations can now be removed
  await prisma.category.deleteMany({});
  await prisma.location.deleteMany({});

  console.log("✓ Marketplace data removed.");

  // --------------------------------------------------
  // 2. REMOVE NON-ADMIN USERS
  // --------------------------------------------------

  await prisma.user.deleteMany({
    where: {
      role: {
        not: "ADMIN",
      },
    },
  });

  console.log("✓ Non-admin users removed.");

  // --------------------------------------------------
  // 3. CREATE / UPDATE ADMIN
  // --------------------------------------------------

  const adminEmail = process.env.ADMIN_EMAIL;
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

  console.log(`✓ Admin account ready: ${admin.email}`);

  // --------------------------------------------------
  // 4. DONE
  // --------------------------------------------------

  console.log("");
  console.log("=================================");
  console.log("🌱 ReMarket production seed complete!");
  console.log("=================================");
  console.log("");
  console.log("Database now contains:");
  console.log("✓ Admin account");
  console.log("✓ No demo businesses");
  console.log("✓ No demo products");
  console.log("✓ No demo categories");
  console.log("✓ No demo locations");
  console.log("");
  console.log(`Admin email: ${admin.email}`);
  console.log("");
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

