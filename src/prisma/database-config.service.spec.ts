import { buildDatabaseUrl, resolveDatabaseConfig } from './database-config';

const secretValues = [
  'secret-host.internal',
  'secret-user',
  'secret-password',
  'secret-database',
];

function secretEnvironment(
  overrides: Record<string, unknown> = {},
): Record<string, string | undefined> {
  return {
    DATABASE_SECRET: JSON.stringify({
      username: secretValues[1],
      password: secretValues[2],
      ...overrides,
    }),
    DATABASE_HOST: secretValues[0],
    DATABASE_NAME: secretValues[3],
    DATABASE_SCHEMA: 'public',
  };
}

describe('resolveDatabaseConfig', () => {
  it('resolves DATABASE_URL without DATABASE_SECRET', () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL:
          'postgresql://local%40user:local%3Apassword@localhost:5433/quadra?schema=tenant',
      }),
    ).toEqual({
      host: 'localhost',
      port: 5433,
      user: 'local@user',
      password: 'local:password',
      database: 'quadra',
      schema: 'tenant',
      ssl: false,
    });
  });

  it('uses URL defaults', () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: 'postgresql://user:password@localhost/quadra',
      }),
    ).toMatchObject({ port: 5432, schema: 'public' });
  });

  it('enables TLS when the URL requests sslmode', () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: 'postgresql://user:password@host/quadra?sslmode=require',
      }).ssl,
    ).toBe(true);
  });

  it('takes credentials from the secret and the rest from the environment', () => {
    expect(resolveDatabaseConfig(secretEnvironment())).toEqual({
      host: secretValues[0],
      port: 5432,
      user: secretValues[1],
      password: secretValues[2],
      database: secretValues[3],
      schema: 'public',
      ssl: true,
    });
  });

  it('ignores unknown secret fields', () => {
    expect(
      resolveDatabaseConfig(
        secretEnvironment({
          dbInstanceIdentifier: 'ignored-by-the-application',
        }),
      ).user,
    ).toBe(secretValues[1]);
  });

  it('defaults a missing DATABASE_PORT to 5432', () => {
    expect(resolveDatabaseConfig(secretEnvironment()).port).toBe(5432);
  });

  it.each(['1', '65535'])('accepts boundary port %s', (port) => {
    const environment = secretEnvironment();
    environment.DATABASE_PORT = port;

    expect(resolveDatabaseConfig(environment).port).toBe(Number(port));
  });

  it.each([
    [
      'invalid JSON',
      { ...secretEnvironment(), DATABASE_SECRET: '{' },
      'DATABASE_SECRET is invalid JSON.',
    ],
    [
      'null',
      { ...secretEnvironment(), DATABASE_SECRET: 'null' },
      'DATABASE_SECRET is invalid: expected a JSON object.',
    ],
    [
      'array',
      { ...secretEnvironment(), DATABASE_SECRET: '[]' },
      'DATABASE_SECRET is invalid: expected a JSON object.',
    ],
    [
      'missing host',
      { ...secretEnvironment(), DATABASE_HOST: undefined },
      'Database configuration is invalid: DATABASE_HOST is required when DATABASE_SECRET is used.',
    ],
    [
      'missing database name',
      { ...secretEnvironment(), DATABASE_NAME: undefined },
      'Database configuration is invalid: DATABASE_NAME is required when DATABASE_SECRET is used.',
    ],
    [
      'missing schema',
      { ...secretEnvironment(), DATABASE_SCHEMA: undefined },
      'Database configuration is invalid: DATABASE_SCHEMA is required when DATABASE_SECRET is used.',
    ],
    ['invalid URL', { DATABASE_URL: 'not a URL' }, 'DATABASE_URL is invalid.'],
  ])('rejects %s safely', (_case, environment, message) => {
    expect(() => resolveDatabaseConfig(environment)).toThrow(message);
  });

  it.each(['0', '65536', '5432.5', 'not-a-port'])('rejects port %s', (port) => {
    const environment = secretEnvironment();
    environment.DATABASE_PORT = port;

    expect(() => resolveDatabaseConfig(environment)).toThrow(
      'Database configuration is invalid: DATABASE_PORT must be an integer between 1 and 65535.',
    );
  });

  it.each(['username', 'password'])(
    'rejects missing required field %s',
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
    ['username', false],
    ['password', '   '],
  ])('rejects invalid field %s', (field, value) => {
    expect(() =>
      resolveDatabaseConfig(secretEnvironment({ [field]: value })),
    ).toThrow(
      `DATABASE_SECRET is invalid: field "${field}" must be a non-empty string.`,
    );
  });

  it('rejects both modes', () => {
    expect(() =>
      resolveDatabaseConfig({
        ...secretEnvironment(),
        DATABASE_URL: 'postgresql://user:password@localhost/quadra',
      }),
    ).toThrow(
      'Database configuration is invalid: DATABASE_SECRET and DATABASE_URL cannot be set together.',
    );
  });

  it.each([{}, { DATABASE_SECRET: ' ', DATABASE_URL: '\t' }])(
    'rejects missing modes',
    (environment) => {
      expect(() => resolveDatabaseConfig(environment)).toThrow(
        'Database configuration is missing: set DATABASE_SECRET or DATABASE_URL.',
      );
    },
  );

  it('never includes fixture secrets in errors', () => {
    for (const environment of [
      { ...secretEnvironment(), DATABASE_HOST: undefined },
      secretEnvironment({ username: false }),
    ]) {
      try {
        resolveDatabaseConfig(environment);
        throw new Error('Expected database configuration to fail.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const value of secretValues) {
          expect(message).not.toContain(value);
        }
      }
    }
  });
});

describe('buildDatabaseUrl', () => {
  it('encodes every dynamic connection component', () => {
    expect(
      buildDatabaseUrl({
        host: 'database.internal',
        port: 5432,
        user: 'user@example.com',
        password: 'p:/?#[]@!$&',
        database: 'quadra prod',
        schema: 'public data',
        ssl: false,
      }),
    ).toBe(
      'postgresql://user%40example.com:p%3A%2F%3F%23%5B%5D%40!$&@database.internal:5432/quadra%20prod?schema=public+data',
    );
  });

  it('requires TLS when the configuration enables it', () => {
    expect(
      buildDatabaseUrl({
        host: 'database.internal',
        port: 5432,
        user: 'user',
        password: 'password',
        database: 'quadra',
        schema: 'public',
        ssl: true,
      }),
    ).toContain('sslmode=require');
  });
});
