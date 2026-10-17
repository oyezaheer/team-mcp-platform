
import prisma from "./lib/prisma.js";

async function main() {
  const users = await prisma.user.count();

  console.log("Database connected successfully!");
  console.log("User count:", users);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
