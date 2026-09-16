import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { Availability } from "@prisma/client";
async function main() {
  console.log("🌱 Starting LocalMarket seed...");

  // --------------------------------------------------
  // 1. ADMIN
  // --------------------------------------------------
  const adminPassword = await bcrypt.hash("admin1234", 10);

  await prisma.user.upsert({
    where: {
      email: "admin@local-market.com",
    },
    update: {
      password: adminPassword,
      role: "ADMIN",
    },
    create: {
      email: "admin@local-market.com",
      password: adminPassword,
      role: "ADMIN",
      name: "LocalMarket Admin",
    },
  });

  // --------------------------------------------------
  // 2. LOCATIONS
  // --------------------------------------------------

  const locationsData = [
    {
      area: "LASU",
      lat: 6.4698,
      long: 3.2015,
    },
    {
      area: "Lekki",
      lat: 6.4474,
      long: 3.4548,
    },
    {
      area: "Yaba",
      lat: 6.5158,
      long: 3.3696,
    },
    {
      area: "Ojo",
      lat: 6.4634,
      long: 3.1811,
    },
  ];

  const locations = new Map<string, { id: string }>();

  for (const location of locationsData) {
    const saved = await prisma.location.upsert({
      where: {
        area: location.area,
      },
      update: {
        lat: location.lat,
        long: location.long,
      },
      create: location,
    });

    locations.set(location.area, saved);
  }

  // --------------------------------------------------
  // 3. CATEGORIES
  // --------------------------------------------------

  const categoryNames = [
    "Fashion",
    "Electronics",
    "Food",
    "Beauty",
    "Textiles",
    "Services",
  ];

  const categories = new Map<string, { id: string }>();

  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: {
        name,
      },
      update: {},
      create: {
        name,
      },
    });

    categories.set(name, category);
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  const locationId = (area: string) => {
    const location = locations.get(area);

    if (!location) {
      throw new Error(`Location "${area}" was not found.`);
    }

    return location.id;
  };

  const categoryId = (name: string) => {
    const category = categories.get(name);

    if (!category) {
      throw new Error(`Category "${name}" was not found.`);
    }

    return category.id;
  };

  // --------------------------------------------------
  // 4. BUSINESSES + PRODUCTS
  // --------------------------------------------------

  const businesses = [
    {
      name: "Mandy Treasures",
      ownerName: "Mandy",
      description:
        "Fashion store offering shoes, sneakers, bags and everyday fashion items.",
      area: "LASU",
      categories: ["Fashion"],
      priceMin: 5000,
      priceMax: 30000,
      phone: "08012345678",
      verification: "VERIFIED" as const,
      availability: Availability.AVAILABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348012345678",
        },
        {
          platform: "INSTAGRAM" as const,
          handle: "mandytreasures",
        },
        {
          platform: "TIKTOK" as const,
          handle: "mandytreasures",
        },
      ],
      products: [
        {
          name: "Classic Sneakers",
          description: "Casual sneakers for everyday wear.",
          category: "Fashion",
          priceMin: 12000,
          priceMax: 18000,
          price: 20000,
          availability: Availability.AVAILABLE,
          keywords: [
            "shoes",
            "sneakers",
            "footwear",
            "fashion",
            "casual",
          ],
        },
        {
          name: "Ladies Handbag",
          description: "Simple everyday handbag.",
          category: "Fashion",
          price: 15000,
          priceMin:10000,
          priceMax: 15000,
          availability: Availability.ASK_SELLER,
          keywords: [
            "bag",
            "handbag",
            "ladies bag",
            "fashion",
          ],
        },
      ],
    },

    {
      name: "Chidi Electronics",
      ownerName: "Chidi",
      description:
        "Electronics and phone accessories including chargers, earphones and power banks.",
      area: "LASU",
      categories: ["Electronics"],
      priceMin: 2000,
      priceMax: 25000,
      phone: "08098765432",
      verification: "UNVERIFIED" as const,
      availability: Availability.ASK_SELLER,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348098765432",
        },
        {
          platform: "FACEBOOK" as const,
          handle: "chidi.electronics",
        },
      ],
      products: [
        {
          name: "Fast Phone Charger",
          description: "Fast charging adapter for smartphones.",
          category: "Electronics",
          priceMin: 5000,
          priceMax: 8000,
          price: 10000,
          availability: Availability.AVAILABLE,
          keywords: [
            "charger",
            "phone charger",
            "fast charger",
            "adapter",
            "electronics",
          ],
        },
        {
          name: "Wireless Earbuds",
          description: "Bluetooth wireless earbuds.",
          category: "Electronics",
          price: 12000,
          priceMax: 13000,
          priceMin: 15000,
          availability: "ASK_SELLER" as const,
          keywords: [
            "earbuds",
            "earphones",
            "bluetooth",
            "wireless",
            "electronics",
          ],
        },
      ],
    },

    {
      name: "Bola Fabrics",
      ownerName: "Bola",
      description:
        "Fabric seller offering Ankara, lace and other materials for clothing.",
      area: "Yaba",
      categories: ["Textiles"],
      priceMin: 4000,
      priceMax: 15000,
      phone: "08055512345",
      verification: "VERIFIED" as const,
      availability: Availability.AVAILABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348055512345",
        },
        {
          platform: "INSTAGRAM" as const,
          handle: "bolafabrics",
        },
      ],
      products: [
        {
          name: "Ankara Fabric",
          description: "Colorful Ankara fabric for clothing.",
          category: "Textiles",
          priceMin: 6000,
          priceMax: 10000,
          price: 5000,
          availability: Availability.ASK_SELLER,
          keywords: [
            "ankara",
            "fabric",
            "material",
            "textile",
            "clothing",
          ],
        },
        {
          name: "Lace Fabric",
          description: "Lace material for dresses and special occasions.",
          category: "Textiles",
          priceMin: 10000,
          priceMax: 15000,
          price: 20000,
          availability: Availability.AVAILABLE,
          keywords: [
            "lace",
            "fabric",
            "material",
            "dress",
            "textile",
          ],
        },
      ],
    },

    {
      name: "Fresh Bowl Kitchen",
      ownerName: "Amaka",
      description:
        "Local food vendor serving rice meals, chicken and other ready-to-eat meals.",
      area: "Ojo",
      categories: ["Food"],
      priceMin: 1500,
      priceMax: 8000,
      phone: "08033344556",
      verification: "VERIFIED" as const,
      availability: Availability.AVAILABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348033344556",
        },
        {
          platform: "INSTAGRAM" as const,
          handle: "freshbowlkitchen",
        },
      ],
      products: [
        {
          name: "Jollof Rice and Chicken",
          description: "Jollof rice served with chicken.",
          category: "Food",
          price: 3500,
          priceMax: 4000,
          priceMin: 6000,
          availability: Availability.AVAILABLE,
          keywords: [
            "rice",
            "jollof",
            "chicken",
            "food",
            "meal",
          ],
        },
        {
          name: "Fried Rice",
          description: "Fresh fried rice meal.",
          category: "Food",
          price: 2500,
          priceMax: 3000,
          priceMin: 5000,
          availability: "AVAILABLE" as const,
          keywords: [
            "fried rice",
            "rice",
            "food",
            "meal",
          ],
        },
      ],
    },

    {
      name: "Glow Beauty Hub",
      ownerName: "Sarah",
      description:
        "Beauty store selling skincare, body care and beauty products.",
      area: "Lekki",
      categories: ["Beauty"],
      priceMin: 3000,
      priceMax: 25000,
      phone: "08066677889",
      verification: "UNVERIFIED" as const,
      availability: Availability.AVAILABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348066677889",
        },
        {
          platform: "TIKTOK" as const,
          handle: "glowbeautyhub",
        },
      ],
      products: [
        {
          name: "Body Lotion",
          description: "Everyday body lotion.",
          category: "Beauty",
          priceMin: 5000,
          priceMax: 8000,
          price: 10000,
          availability: Availability.AVAILABLE,
          keywords: [
            "lotion",
            "body lotion",
            "skincare",
            "beauty",
            "body care",
          ],
        },
        {
          name: "Face Cleanser",
          description: "Gentle facial cleanser.",
          category: "Beauty",
          price: 7000,
          priceMax: 8000,
          priceMin: 10000,
          availability: Availability.ASK_SELLER,
          keywords: [
            "cleanser",
            "face wash",
            "skincare",
            "beauty",
          ],
        },
      ],
    },

    {
      name: "Tech Corner LASU",
      ownerName: "David",
      description:
        "Computer accessories and small tech products around LASU.",
      area: "LASU",
      categories: ["Electronics", "Services"],
      priceMin: 3000,
      priceMax: 50000,
      phone: "08077788990",
      verification: "VERIFIED" as const,
      availability: Availability.AVAILABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348077788990",
        },
        {
          platform: "PHONE" as const,
          handle: "08077788990",
        },
      ],
      products: [
        {
          name: "Laptop Charger",
          description: "Replacement charger for compatible laptops.",
          category: "Electronics",
          priceMin: 8000,
          priceMax: 15000,
          price: 20000,
          availability: Availability.AVAILABLE,
          keywords: [
            "laptop",
            "charger",
            "computer",
            "electronics",
          ],
        },
        {
          name: "Wireless Mouse",
          description: "Wireless computer mouse.",
          category: "Electronics",
          price: 5000,
          priceMin: 7000,
          priceMax: 10000,
          availability: Availability.AVAILABLE,
          keywords: [
            "mouse",
            "wireless mouse",
            "computer",
            "accessories",
          ],
        },
      ],
    },

    {
      name: "Ojo Styles",
      ownerName: "Tolu",
      description:
        "Affordable clothing and casual wear for everyday use.",
      area: "Ojo",
      categories: ["Fashion"],
      priceMin: 4000,
      priceMax: 20000,
      phone: "08088899001",
      verification: "UNVERIFIED" as const,
      availability: Availability.UNAVALIABLE,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348088899001",
        },
      ],
      products: [
        {
          name: "Casual T-Shirt",
          description: "Plain casual T-shirt.",
          category: "Fashion",
          price: 5000,
          priceMin: 7000,
          priceMax:10000,
          availability: Availability.AVAILABLE,
          keywords: [
            "shirt",
            "tshirt",
            "t-shirt",
            "clothing",
            "fashion",
          ],
        },
      ],
    },

    {
      name: "Yaba Home Services",
      ownerName: "Michael",
      description:
        "Local repair and installation services for homes and small businesses.",
      area: "Yaba",
      categories: ["Services"],
      priceMin: 5000,
      priceMax: 30000,
      price: 20000,
      phone: "08099900112",
      verification: "VERIFIED" as const,
      availability: Availability.ASK_SELLER,
      socialLinks: [
        {
          platform: "WHATSAPP" as const,
          handle: "2348099900112",
        },
        {
          platform: "PHONE" as const,
          handle: "08099900112",
        },
      ],
      products: [
        {
          name: "Electrical Repair",
          description: "Basic electrical repair service.",
          category: "Services",
          priceMin: 5000,
          priceMax: 15000,
          price: 10000,
          availability: Availability.ASK_SELLER,
          keywords: [
            "electrician",
            "electrical",
            "repair",
            "wiring",
            "service",
          ],
        },
      ],
    },
  ];

  // --------------------------------------------------
  // 5. CREATE / UPDATE BUSINESSES
  // --------------------------------------------------

  for (const businessData of businesses) {
    const existing = await prisma.business.findFirst({
      where: {
        name: businessData.name,
      },
    });

    const business = existing
      ? await prisma.business.update({
          where: {
            id: existing.id,
          },
          data: {
            ownerName: businessData.ownerName,
            description: businessData.description,
            locationId: locationId(businessData.area),
            priceMin: businessData.priceMin,
            priceMax: businessData.priceMax,
            phone: businessData.phone,
            verification: businessData.verification,
            availability:businessData.availability,
            status: "ACTIVE",
          },
        })
      : await prisma.business.create({
          data: {
            name: businessData.name,
            ownerName: businessData.ownerName,
            description: businessData.description,
            locationId: locationId(businessData.area),
            priceMin: businessData.priceMin,
            priceMax: businessData.priceMax,
            phone: businessData.phone,
            verification: businessData.verification,
            availability: businessData.availability,
            status: "ACTIVE",
          },
        });

    // ------------------------------------------------
    // Categories
    // ------------------------------------------------

    await prisma.businessCategory.deleteMany({
      where: {
        businessId: business.id,
      },
    });

    await prisma.businessCategory.createMany({
      data: businessData.categories.map((category) => ({
        businessId: business.id,
        categoryId: categoryId(category),
      })),
      skipDuplicates: true,
    });

    // ------------------------------------------------
    // Social links
    // ------------------------------------------------

    await prisma.businessSocialLink.deleteMany({
      where: {
        businessId: business.id,
      },
    });

    await prisma.businessSocialLink.createMany({
      data: businessData.socialLinks.map((social) => ({
        businessId: business.id,
        platform: social.platform,
        handle: social.handle,
      })),
    });

    // ------------------------------------------------
    // Products
    // ------------------------------------------------

    await prisma.product.deleteMany({
      where: {
        businessId: business.id,
      },
    });

    await prisma.product.createMany({
        data: businessData.products.map((product) => ({
        businessId: business.id,
        name: product.name,
        description: product.description,
        categoryId: categoryId(product.category),
        price: product.price,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        availability: product.availability,
        keywords: product.keywords,
        status: "ACTIVE",
      })),
      
    });

    console.log(`✓ ${business.name}`);
  }

  // --------------------------------------------------
  // DONE
  // --------------------------------------------------

  console.log("");
  console.log("=================================");
  console.log("🌱 LocalMarket seed complete!");
  console.log("=================================");
  console.log("");
  console.log("Admin:");
  console.log("Email:    admin@local-market.com");
  console.log("Password: admin1234");
  console.log("");
  console.log(`Categories: ${categoryNames.length}`);
  console.log(`Businesses: ${businesses.length}`);
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