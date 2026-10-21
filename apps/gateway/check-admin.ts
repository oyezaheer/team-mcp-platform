import "dotenv/config";
import prisma from "./src/lib/prisma.js";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "member@example.com" },
    select: { email: true, role: true },
  });

  console.log(user ?? "Admin user not found");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
