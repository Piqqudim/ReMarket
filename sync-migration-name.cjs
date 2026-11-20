
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("@next/env").loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const oldName = "[new_migration]_showBusinessInfo";
const newName = "20261120170000_show_business_info";

const migrationFile = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  newName,
  "migration.sql"
);

async function main() {
  if (!fs.existsSync(migrationFile)) {
    throw new Error("The renamed migration SQL file was not found.");
  }

  const sql = fs.readFileSync(migrationFile, "utf8");

  const checksum = crypto
    .createHash("sha256")
    .update(sql, "utf8")
    .digest("hex");

  const oldRows = await prisma.$queryRaw`
    SELECT id, migration_name, checksum, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = ${oldName}
  `;

  const newRows = await prisma.$queryRaw`
    SELECT id
    FROM "_prisma_migrations"
    WHERE migration_name = ${newName}
  `;

  console.log("Old records:", oldRows.length);
  console.log("New records:", newRows.length);

  if (oldRows.length !== 1 || newRows.length !== 0) {
    throw new Error("Migration history check failed. Nothing changed.");
  }

  const record = oldRows[0];

  if (!record.finished_at || record.rolled_back_at) {
    throw new Error("Migration is not successfully applied.");
  }

  if (record.checksum !== checksum) {
    throw new Error(
      "Checksum mismatch. The migration SQL may have changed. Nothing updated."
    );
  }

  if (!process.argv.includes("--apply")) {
    console.log("All checks passed.");
    console.log("No changes made.");
    console.log("To apply, run: node sync-migration-name.cjs --apply");
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE "_prisma_migrations"
    SET migration_name = ${newName}
    WHERE id = ${record.id}
      AND migration_name = ${oldName}
      AND checksum = ${checksum}
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `;

  if (updated !== 1) {
    throw new Error("Expected exactly one migration record update.");
  }

  console.log("SUCCESS: Migration history name synchronized.");
  console.log("Old:", oldName);
  console.log("New:", newName);
}

main()
  .catch(error => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
