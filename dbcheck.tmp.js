const { PrismaClient } = require("./generated/prisma/client");
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ select: { email: true, role: true, status: true, organizationId: true, emailVerifiedAt: true } });
  console.log("USERS:", JSON.stringify(users, null, 2));
  const orgs = await p.organization.findMany({ select: { id: true, name: true, subdomain: true } });
  console.log("ORGS:", JSON.stringify(orgs, null, 2));
  await p.$disconnect();
})().catch(async (e) => { console.log("ERR:", e.message); await p.$disconnect(); });
