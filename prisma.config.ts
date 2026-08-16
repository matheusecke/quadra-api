import "dotenv/config";
import { defineConfig } from "prisma/config";

import {
  buildDatabaseUrl,
  resolveDatabaseConfig,
} from "./src/prisma/database-config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildDatabaseUrl(resolveDatabaseConfig()),
  },
});
