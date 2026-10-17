import "dotenv/config";
import prisma from "./src/lib/prisma.js";

async function main() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      toolName: true,
      status: true,
      userId: true,
      upstreamId: true,
      createdAt: true,
      details: true,
    },
  });

  console.log(JSON.stringify(logs, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
