export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
  /**
   * RDS enforces `rds.force_ssl`, so the managed-secret path always negotiates
   * TLS. The local Docker Compose database serves no certificate.
   */
  ssl: boolean;
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
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `DATABASE_SECRET is invalid: field "${field}" must be a non-empty string.`,
    );
  }

  return field === 'password' ? value : value.trim();
}

function parseSecret(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('DATABASE_SECRET is invalid JSON.');
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('DATABASE_SECRET is invalid: expected a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function requiredEnvironmentValue(
  environment: DatabaseEnvironment,
  name: string,
): string {
  const value = present(environment[name]);
  if (!value) {
    throw new Error(
      `Database configuration is invalid: ${name} is required when DATABASE_SECRET is used.`,
    );
  }
  return value;
}

/**
 * The secret managed by RDS carries credentials only. Every other connection
 * component is non-sensitive and comes from the environment.
 */
function resolveSecretConfig(
  secretValue: string,
  environment: DatabaseEnvironment,
): DatabaseConfig {
  const secret = parseSecret(secretValue);

  const port = present(environment.DATABASE_PORT) ?? '5432';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(
      'Database configuration is invalid: DATABASE_PORT must be an integer between 1 and 65535.',
    );
  }

  return {
    host: requiredEnvironmentValue(environment, 'DATABASE_HOST'),
    port: Number(port),
    user: requiredSecretString(secret, 'username'),
    password: requiredSecretString(secret, 'password'),
    database: requiredEnvironmentValue(environment, 'DATABASE_NAME'),
    schema: requiredEnvironmentValue(environment, 'DATABASE_SCHEMA'),
    ssl: true,
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
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      schema: url.searchParams.get('schema') ?? 'public',
      ssl: (url.searchParams.get('sslmode') ?? 'disable') !== 'disable',
    };
  } catch {
    throw new Error('DATABASE_URL is invalid.');
  }
}

export function resolveDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): DatabaseConfig {
  const secret = present(environment.DATABASE_SECRET);
  const url = present(environment.DATABASE_URL);

  if (secret && url) {
    throw new Error(
      'Database configuration is invalid: DATABASE_SECRET and DATABASE_URL cannot be set together.',
    );
  }
  if (!secret && !url) {
    throw new Error(
      'Database configuration is missing: set DATABASE_SECRET or DATABASE_URL.',
    );
  }
  return secret
    ? resolveSecretConfig(secret, environment)
    : resolveUrlConfig(url!);
}

export function buildDatabaseUrl(config: DatabaseConfig): string {
  const url = new URL('postgresql://localhost');
  url.hostname = config.host;
  url.port = String(config.port);
  url.username = config.user;
  url.password = config.password;
  url.pathname = config.database;
  url.searchParams.set('schema', config.schema);
  if (config.ssl) {
    url.searchParams.set('sslmode', 'require');
  }
  return url.toString();
}
