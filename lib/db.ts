import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads in dev (otherwise each reload opens a new connection pool).
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
