import "dotenv/config";
import prisma from "./src/lib/prisma.js";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "member3@example.com" },
    include: {
      apiKeys: {
        where: { revokedAt: null },
        select: { id: true, keyPrefix: true, revokedAt: true, createdAt: true }
      }
    }
  });

  console.log(JSON.stringify(user, null, 2));
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
