import "dotenv/config";
import prisma from "./src/lib/prisma.ts";

const logs = await prisma.auditLog.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    userId: true,
    upstreamId: true,
    toolName: true,
    status: true,
    details: true,
    createdAt: true
  }
});

console.log(JSON.stringify(logs, null, 2));
process.exit(0);
