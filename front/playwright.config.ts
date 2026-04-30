import { defineConfig, devices } from "@playwright/test";

delete process.env.NO_COLOR;

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const loopbackBaseURL = `http://127.0.0.1:${port}`;
const allowedOrigins = `${baseURL},${loopbackBaseURL}`;
const apiBaseURL = process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:18080";
const apiURL = new URL(apiBaseURL);
const apiPort = apiURL.port || (apiURL.protocol === "https:" ? "443" : "80");
const dbHost = process.env.READMATES_E2E_DB_HOST ?? "127.0.0.1";
const dbPort = process.env.READMATES_E2E_DB_PORT ?? "3306";
const dbUser = process.env.READMATES_E2E_DB_USER ?? "readmates";
const dbPassword = process.env.READMATES_E2E_DB_PASSWORD ?? process.env.MYSQL_PWD ?? "readmates";
const dbName = process.env.READMATES_E2E_DB_NAME ?? "readmates_e2e";
const jdbcUrl =
  process.env.SPRING_DATASOURCE_URL ??
  `jdbc:mysql://${dbHost}:${dbPort}/${dbName}?serverTimezone=UTC&allowPublicKeyRetrieval=true&useSSL=false`;
const createDatabaseSql = `create database if not exists \`${dbName.replaceAll("`", "``")}\` character set utf8mb4 collate utf8mb4_0900_ai_ci`;

function shellQuote(value: string | number) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function envAssignment(name: string, value: string | number) {
  return `${name}=${shellQuote(value)}`;
}

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/e2e/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        `${envAssignment("MYSQL_PWD", dbPassword)} mysql --protocol=TCP -h ${shellQuote(dbHost)} -P ${shellQuote(dbPort)} ` +
        `-u ${shellQuote(dbUser)} --execute ${shellQuote(createDatabaseSql)}; ` +
        `${envAssignment("SPRING_PROFILES_ACTIVE", "dev")} ${envAssignment("SERVER_PORT", apiPort)} ` +
        `${envAssignment("SPRING_DATASOURCE_URL", jdbcUrl)} ` +
        `${envAssignment("SPRING_DATASOURCE_USERNAME", dbUser)} ${envAssignment("SPRING_DATASOURCE_PASSWORD", dbPassword)} ` +
        `${envAssignment("READMATES_APP_BASE_URL", baseURL)} ${envAssignment("READMATES_ALLOWED_ORIGINS", allowedOrigins)} ` +
        `${envAssignment("READMATES_BFF_SECRET", "e2e-secret")} ` +
        `${envAssignment("READMATES_MANAGEMENT_PORT", "0")} ` +
        `${envAssignment("READMATES_FLYWAY_LOCATIONS", "classpath:db/mysql/migration,classpath:db/mysql/dev")} ` +
        `${envAssignment("READMATES_AUTH_SESSION_COOKIE_SECURE", "false")} ` +
        "../server/gradlew -p ../server bootRun",
      url: `${apiBaseURL}/internal/health`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command:
        `${envAssignment("READMATES_API_BASE_URL", apiBaseURL)} ` +
        `${envAssignment("READMATES_BFF_SECRET", "e2e-secret")} ` +
        `pnpm exec vite --host 127.0.0.1 --port ${shellQuote(port)}`,
      url: `${baseURL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
