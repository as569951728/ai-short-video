import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

let prisma: PrismaClient | null = null;

export function getPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required before using the database client.');
  }

  if (!prisma) {
    prisma = new PrismaClient({
      adapter: new PrismaMariaDb(env.DATABASE_URL)
    });
  }

  return prisma;
}

export async function disconnectPrismaClient() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
