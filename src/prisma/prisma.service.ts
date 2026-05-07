import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

function getDatabaseConfig(): { connectionString: string; schema?: string } {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL must be defined before PrismaService is initialized.',
    );
  }

  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? undefined;

  // Prisma keeps schema selection outside the pg connection string when using driver adapters.
  url.searchParams.delete('schema');

  return {
    connectionString: url.toString(),
    schema,
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const { connectionString, schema } = getDatabaseConfig();
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool, {
      ...(schema ? { schema } : {}),
      disposeExternalPool: false,
    });

    super({ adapter });

    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
