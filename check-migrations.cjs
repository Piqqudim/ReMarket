const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = '[new_migration]_showBusinessInfo'
  `;

  console.table(rows);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());