import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const warnedValues = new Set<string>();

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
  return PREFIX + [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;

  let parts = value.slice(PREFIX.length).split(".");
  // Handle values encrypted with the old buggy format (PREFIX was
  // joined into the array, producing an extra leading empty part).
  if (parts.length === 4 && parts[0] === "") {
    parts = parts.slice(1);
  }
  if (parts.length !== 3) {
    if (!warnedValues.has(value)) {
      warnedValues.add(value);
      console.warn("[secret-crypto] Invalid encrypted secret format — value may not have been encrypted correctly");
    }
    return null;
  }
  try {
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
  } catch (err) {
    if (!warnedValues.has(value)) {
      warnedValues.add(value);
      console.warn("[secret-crypto] Decryption failed — key mismatch or corrupted data");
    }
    return null;
  }
}
