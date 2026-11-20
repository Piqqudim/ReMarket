
const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "prisma", "migrations");

const folders = fs.readdirSync(root)
  .filter(name => fs.statSync(path.join(root, name)).isDirectory())
  .sort();

console.log("\nMIGRATION EXECUTION ORDER:\n");

for (const folder of folders) {
  console.log(folder);

  const file = path.join(root, folder, "migration.sql");

  if (!fs.existsSync(file)) continue;

  const sql = fs.readFileSync(file, "utf8");

  const statements = sql.split(";").filter(statement =>
    /\bBusiness\b|\bDROP\s+SCHEMA\b|\bTRUNCATE\b/i.test(statement)
  );

  for (const statement of statements) {
    console.log("  " + statement.replace(/\s+/g, " ").trim());
  }
}
