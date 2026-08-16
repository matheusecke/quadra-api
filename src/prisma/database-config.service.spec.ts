import { buildDatabaseUrl, resolveDatabaseConfig } from "./database-config";

const secretValues = [
  "secret-host.internal",
  "secret-user",
  "secret-password",
  "secret-database",
];

function secretEnvironment(
  overrides: Record<string, unknown> = {},
): Record<string, string | undefined> {
  return {
    DATABASE_SECRET: JSON.stringify({
      engine: "postgres",
      host: secretValues[0],
      port: 5432,
      username: secretValues[1],
      password: secretValues[2],
      dbname: secretValues[3],
      dbInstanceIdentifier: "ignored-by-the-application",
      ...overrides,
    }),
    DATABASE_SCHEMA: "public",
  };
}

describe("resolveDatabaseConfig", () => {
  it("resolves DATABASE_URL without DATABASE_SECRET", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL:
          "postgresql://local%40user:local%3Apassword@localhost:5433/quadra?schema=tenant",
      }),
    ).toEqual({
      host: "localhost",
      port: 5433,
      user: "local@user",
      password: "local:password",
      database: "quadra",
      schema: "tenant",
    });
  });

  it("uses URL defaults", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: "postgresql://user:password@localhost/quadra",
      }),
    ).toMatchObject({ port: 5432, schema: "public" });
  });

  it("resolves a complete secret and ignores AWS metadata", () => {
    expect(resolveDatabaseConfig(secretEnvironment())).toEqual({
      host: secretValues[0],
      port: 5432,
      user: secretValues[1],
      password: secretValues[2],
      database: secretValues[3],
      schema: "public",
    });
  });

  it("defaults a missing secret port to 5432", () => {
    const environment = secretEnvironment();
    environment.DATABASE_SECRET = JSON.stringify({
      engine: "postgres",
      host: secretValues[0],
      username: secretValues[1],
      password: secretValues[2],
      dbname: secretValues[3],
    });

    expect(resolveDatabaseConfig(environment).port).toBe(5432);
  });

  it("uses DATABASE_NAME when dbname is absent", () => {
    const environment = secretEnvironment();
    environment.DATABASE_NAME = "quadra";
    environment.DATABASE_SECRET = JSON.stringify({
      engine: "postgres",
      host: secretValues[0],
      username: secretValues[1],
      password: secretValues[2],
    });

    expect(resolveDatabaseConfig(environment).database).toBe("quadra");
  });

  it.each([1, 65535])("accepts boundary port %i", (port) => {
    expect(resolveDatabaseConfig(secretEnvironment({ port })).port).toBe(port);
  });

  it.each([
    [
      "invalid JSON",
      { DATABASE_SECRET: "{", DATABASE_SCHEMA: "public" },
      "DATABASE_SECRET is invalid JSON.",
    ],
    [
      "null",
      { DATABASE_SECRET: "null", DATABASE_SCHEMA: "public" },
      "DATABASE_SECRET is invalid: expected a JSON object.",
    ],
    [
      "array",
      { DATABASE_SECRET: "[]", DATABASE_SCHEMA: "public" },
      "DATABASE_SECRET is invalid: expected a JSON object.",
    ],
    [
      "wrong engine",
      secretEnvironment({ engine: "mysql" }),
      'DATABASE_SECRET is invalid: field "engine" must be "postgres".',
    ],
    [
      "low port",
      secretEnvironment({ port: 0 }),
      'DATABASE_SECRET is invalid: field "port" must be an integer between 1 and 65535.',
    ],
    [
      "high port",
      secretEnvironment({ port: 65536 }),
      'DATABASE_SECRET is invalid: field "port" must be an integer between 1 and 65535.',
    ],
    [
      "decimal port",
      secretEnvironment({ port: 5432.5 }),
      'DATABASE_SECRET is invalid: field "port" must be an integer between 1 and 65535.',
    ],
    [
      "string port",
      secretEnvironment({ port: "5432" }),
      'DATABASE_SECRET is invalid: field "port" must be an integer between 1 and 65535.',
    ],
    [
      "missing schema",
      { ...secretEnvironment(), DATABASE_SCHEMA: undefined },
      "Database configuration is invalid: DATABASE_SCHEMA is required when DATABASE_SECRET is used.",
    ],
    ["invalid URL", { DATABASE_URL: "not a URL" }, "DATABASE_URL is invalid."],
  ])("rejects %s safely", (_case, environment, message) => {
    expect(() => resolveDatabaseConfig(environment)).toThrow(message);
  });

  it.each(["engine", "host", "username", "password"])(
    "rejects missing required field %s",
    (field) => {
      const parsed = JSON.parse(secretEnvironment().DATABASE_SECRET!);
      delete parsed[field];
      const environment = secretEnvironment();
      environment.DATABASE_SECRET = JSON.stringify(parsed);

      expect(() => resolveDatabaseConfig(environment)).toThrow(
        `DATABASE_SECRET is invalid: required field "${field}" is missing.`,
      );
    },
  );

  it.each([
    ["engine", "   "],
    ["host", 123],
    ["username", false],
    ["password", "   "],
    ["dbname", []],
  ])("rejects invalid field %s", (field, value) => {
    expect(() =>
      resolveDatabaseConfig(secretEnvironment({ [field]: value })),
    ).toThrow(
      `DATABASE_SECRET is invalid: field "${field}" must be a non-empty string.`,
    );
  });

  it("requires DATABASE_NAME when dbname is absent", () => {
    const environment = secretEnvironment();
    environment.DATABASE_SECRET = JSON.stringify({
      engine: "postgres",
      host: secretValues[0],
      username: secretValues[1],
      password: secretValues[2],
    });

    expect(() => resolveDatabaseConfig(environment)).toThrow(
      'Database configuration is invalid: DATABASE_NAME is required when "dbname" is absent.',
    );
  });

  it("rejects both modes", () => {
    expect(() =>
      resolveDatabaseConfig({
        ...secretEnvironment(),
        DATABASE_URL: "postgresql://user:password@localhost/quadra",
      }),
    ).toThrow(
      "Database configuration is invalid: DATABASE_SECRET and DATABASE_URL cannot be set together.",
    );
  });

  it.each([{}, { DATABASE_SECRET: " ", DATABASE_URL: "\t" }])(
    "rejects missing modes",
    (environment) => {
      expect(() => resolveDatabaseConfig(environment)).toThrow(
        "Database configuration is missing: set DATABASE_SECRET or DATABASE_URL.",
      );
    },
  );

  it("never includes fixture secrets in errors", () => {
    for (const environment of [
      secretEnvironment({ engine: "mysql" }),
      secretEnvironment({ port: secretValues[2] }),
    ]) {
      try {
        resolveDatabaseConfig(environment);
        throw new Error("Expected database configuration to fail.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const value of secretValues) {
          expect(message).not.toContain(value);
        }
      }
    }
  });
});

describe("buildDatabaseUrl", () => {
  it("encodes every dynamic connection component", () => {
    expect(
      buildDatabaseUrl({
        host: "database.internal",
        port: 5432,
        user: "user@example.com",
        password: "p:/?#[]@!$&",
        database: "quadra prod",
        schema: "public data",
      }),
    ).toBe(
      "postgresql://user%40example.com:p%3A%2F%3F%23%5B%5D%40!$&@database.internal:5432/quadra%20prod?schema=public+data",
    );
  });
});
