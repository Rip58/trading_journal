import { PrismaClient } from '@prisma/client';

// Singleton: en desarrollo el hot reload volvería a instanciar el cliente en
// cada recarga y agotaría el pool de conexiones.
const globalForPrisma = globalThis;

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
