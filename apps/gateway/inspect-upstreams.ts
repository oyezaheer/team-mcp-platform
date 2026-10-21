import "dotenv/config";
import prisma from "./src/lib/prisma.js";

async function main() {
  const upstreams = await prisma.upstream.findMany({
    select: {
      id: true,
      name: true,
      url: true,
      enabled: true,
    },
  });

  console.table(upstreams);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
