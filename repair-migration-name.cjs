
const fs = require("fs");
const path = require("path");

require("@next/env").loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const oldName = "[new_migration]_showBusinessInfo";
const newName = "20261120170000_show_business_info";

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
const oldPath = path.join(migrationsDir, oldName);
const newPath = path.join(migrationsDir, newName);

async function main() {
  console.log("Checking migration history...");

  const oldRows = await prisma.$queryRaw`
    SELECT id, migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = ${oldName}
  `;

  const newRows = await prisma.$queryRaw`
    SELECT id, migration_name
    FROM "_prisma_migrations"
    WHERE migration_name = ${newName}
  `;

  console.log("Old migration records:", oldRows.length);
  console.log("New migration records:", newRows.length);

  if (oldRows.length !== 1) {
    throw new Error(
      "Expected exactly one old migration record. No changes made."
    );
  }

  if (newRows.length !== 0) {
    throw new Error(
      "The new migration name already exists. No changes made."
    );
  }

  const migration = oldRows[0];

  if (!migration.finished_at || migration.rolled_back_at) {
    throw new Error(
      "The old migration is not successfully applied. No changes made."
    );
  }

  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) {
    throw new Error(
      "Migration folder check failed. No changes made."
    );
  }

  if (!process.argv.includes("--apply")) {
    console.log("Checks passed. No changes made yet.");
    console.log("Run: node repair-migration-name.cjs --apply");
    return;
  }

  console.log("Renaming migration folder...");

  fs.renameSync(oldPath, newPath);

  try {
    const updated = await prisma.$executeRaw`
      UPDATE "_prisma_migrations"
      SET migration_name = ${newName}
      WHERE id = ${migration.id}
        AND migration_name = ${oldName}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;

    if (updated !== 1) {
      throw new Error("Expected exactly one migration record update.");
    }

    console.log("Migration history updated successfully.");
    console.log("Old name:", oldName);
    console.log("New name:", newName);
  } catch (error) {
    fs.renameSync(newPath, oldPath);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("REPAIR FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
