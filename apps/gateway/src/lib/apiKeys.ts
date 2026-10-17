
import { createHash, randomBytes } from "node:crypto";

export function generateApiKey() {
  const secret = randomBytes(32).toString("hex");
  const key = `tmcp_${secret}`;

  const keyHash = createHash("sha256")
    .update(key)
    .digest("hex");

  return {
    key,
    keyHash,
    keyPrefix: key.slice(0, 12),
  };
}

export function hashApiKey(key: string) {
  return createHash("sha256")
    .update(key)
    .digest("hex");
}
