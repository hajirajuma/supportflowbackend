import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
(async () => {
  const users = await (p as any).user.findMany({ select: { email: true, role: true, status: true, organizationId: true, emailVerifiedAt: true } });
  console.log("USERS:", JSON.stringify(users, null, 2));
  const orgs = await (p as any).organization.findMany({ select: { id: true, name: true, subdomain: true } });
  console.log("ORGS:", JSON.stringify(orgs, null, 2));
  await p.$disconnect();
})().catch(async (e) => { console.log("ERR:", e.message); await p.$disconnect(); });
