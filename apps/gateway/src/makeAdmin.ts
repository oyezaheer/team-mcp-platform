
import "dotenv/config";
import prisma from "./lib/prisma.js";

async function main() {
  const user = await prisma.user.update({
    where: { email: "member@example.com" },
    data: { role: "ADMIN" },
  });

  console.log(`Updated ${user.email} to role ${user.role}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
