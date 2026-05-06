import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const frontRoot = resolve(process.cwd());
const defaultMigrationDirectories = [
  resolve(frontRoot, "../server/src/main/resources/db/mysql/migration"),
  resolve(frontRoot, "../server/src/main/resources/db/mysql/dev"),
];

function collectSqlFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSqlFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".sql")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function migrationFingerprint(migrationDirectories: readonly string[]) {
  const hash = createHash("sha256");
  const sqlFiles = migrationDirectories.flatMap(collectSqlFiles).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const sqlFile of sqlFiles) {
    hash.update(relative(frontRoot, sqlFile));
    hash.update("\0");
    hash.update(readFileSync(sqlFile));
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, 12);
}

export function resolveE2eDatabaseName(
  explicitDbName = process.env.READMATES_E2E_DB_NAME,
  migrationDirectories = defaultMigrationDirectories,
) {
  if (explicitDbName) {
    return explicitDbName;
  }

  return `readmates_e2e_${migrationFingerprint(migrationDirectories)}`;
}
