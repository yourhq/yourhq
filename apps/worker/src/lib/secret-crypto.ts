import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.HOSTED_SECRETS_KEY;
  if (!raw) throw new Error("HOSTED_SECRETS_KEY is required");

  for (const encoding of ["base64url", "base64", "hex"] as const) {
    try {
      const key = Buffer.from(raw, encoding);
      if (key.length === 32) return key;
    } catch {
      // Try the next encoding.
    }
  }

  throw new Error("HOSTED_SECRETS_KEY must decode to exactly 32 bytes");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;

  const parts = value.slice(PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivRaw, tagRaw, ciphertextRaw] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
