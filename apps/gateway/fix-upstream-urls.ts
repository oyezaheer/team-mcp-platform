import "dotenv/config";
import prisma from "./src/lib/prisma.js";

async function main() {
  const updates = [
    {
      id: "cmv69u9kc0002cw3n32k77xok",
      url: "http://woocommerce-mcp:3003/mcp",
    },
    {
      id: "cmv6cnicr000j3k3nh0ps57ff",
      url: "http://support-mcp:3004/mcp",
    },
  ];

  for (const item of updates) {
    const result = await prisma.upstream.update({
      where: { id: item.id },
      data: { url: item.url },
      select: { name: true, url: true, enabled: true },
    });

    console.log(result);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
