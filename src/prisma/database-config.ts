export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
};

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requiredSecretString(
  secret: Record<string, unknown>,
  field: string,
): string {
  if (!(field in secret)) {
    throw new Error(
      `DATABASE_SECRET is invalid: required field "${field}" is missing.`,
    );
  }

  const value = secret[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `DATABASE_SECRET is invalid: field "${field}" must be a non-empty string.`,
    );
  }

  return field === "password" ? value : value.trim();
}

function parseSecret(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("DATABASE_SECRET is invalid JSON.");
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("DATABASE_SECRET is invalid: expected a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function resolveSecretConfig(
  secretValue: string,
  environment: DatabaseEnvironment,
): DatabaseConfig {
  const secret = parseSecret(secretValue);
  const engine = requiredSecretString(secret, "engine");
  if (engine !== "postgres") {
    throw new Error(
      'DATABASE_SECRET is invalid: field "engine" must be "postgres".',
    );
  }

  const port = secret.port ?? 5432;
  if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(
      'DATABASE_SECRET is invalid: field "port" must be an integer between 1 and 65535.',
    );
  }

  const database =
    "dbname" in secret
      ? requiredSecretString(secret, "dbname")
      : present(environment.DATABASE_NAME);
  if (!database) {
    throw new Error(
      'Database configuration is invalid: DATABASE_NAME is required when "dbname" is absent.',
    );
  }

  const schema = present(environment.DATABASE_SCHEMA);
  if (!schema) {
    throw new Error(
      "Database configuration is invalid: DATABASE_SCHEMA is required when DATABASE_SECRET is used.",
    );
  }

  return {
    host: requiredSecretString(secret, "host"),
    port: Number(port),
    user: requiredSecretString(secret, "username"),
    password: requiredSecretString(secret, "password"),
    database,
    schema,
  };
}

function resolveUrlConfig(databaseUrl: string): DatabaseConfig {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      schema: url.searchParams.get("schema") ?? "public",
    };
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }
}

export function resolveDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): DatabaseConfig {
  const secret = present(environment.DATABASE_SECRET);
  const url = present(environment.DATABASE_URL);

  if (secret && url) {
    throw new Error(
      "Database configuration is invalid: DATABASE_SECRET and DATABASE_URL cannot be set together.",
    );
  }
  if (!secret && !url) {
    throw new Error(
      "Database configuration is missing: set DATABASE_SECRET or DATABASE_URL.",
    );
  }
  return secret
    ? resolveSecretConfig(secret, environment)
    : resolveUrlConfig(url!);
}

export function buildDatabaseUrl(config: DatabaseConfig): string {
  const url = new URL("postgresql://localhost");
  url.hostname = config.host;
  url.port = String(config.port);
  url.username = config.user;
  url.password = config.password;
  url.pathname = config.database;
  url.searchParams.set("schema", config.schema);
  return url.toString();
}
