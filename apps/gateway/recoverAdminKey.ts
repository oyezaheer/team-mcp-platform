import "dotenv/config";
import prisma from "./src/lib/prisma.js";
import { generateApiKey } from "./src/lib/apiKeys.js";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "member@example.com" },
  });

  if (!user || user.role !== "ADMIN") {
    throw new Error("Admin user not found or does not have ADMIN role");
  }

  const generated = generateApiKey();

  await prisma.apiKey.create({
    data: {
      name: "Recovered admin key",
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      userId: user.id,
    },
  });

  console.log("Admin:", user.email);
  console.log("New API key:", generated.key);
  console.log("Save this key securely; it will not be shown again.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
