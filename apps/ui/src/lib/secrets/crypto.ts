import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from "node:crypto";
import { readActiveWorkspaceWithSecrets } from "@/lib/workspaces/server";

const PREFIX = "enc:v1:";
const HKDF_SALT = "yourhq-secrets-v1";
const HKDF_INFO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const hostedKey = process.env.HOSTED_SECRETS_KEY;
  if (hostedKey) {
    for (const encoding of ["base64url", "base64", "hex"] as const) {
      try {
        const key = Buffer.from(hostedKey, encoding);
        if (key.length === 32) {
          cachedKey = key;
          return key;
        }
      } catch {
        // Try next encoding.
      }
    }
    throw new Error("HOSTED_SECRETS_KEY must decode to exactly 32 bytes");
  }

  const workspace = await readActiveWorkspaceWithSecrets();
  if (!workspace?.serviceRoleKey) {
    throw new Error("No service role key available for secrets encryption");
  }

  const derived = hkdfSync(
    "sha256",
    workspace.serviceRoleKey,
    HKDF_SALT,
    HKDF_INFO,
    32,
  );
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export async function decryptSecret(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;

  let parts = value.slice(PREFIX.length).split(".");
  if (parts.length === 4 && parts[0] === "") parts = parts.slice(1);
  if (parts.length !== 3) return null;

  const key = await getKey();
  try {
    const [ivRaw, tagRaw, ciphertextRaw] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
