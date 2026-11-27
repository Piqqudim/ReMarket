import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const value = process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("Browser Push subscription encryption is not configured. Set PUSH_SUBSCRIPTION_ENCRYPTION_KEY to a random 32-byte base64url key.");
  const decoded = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (decoded.length !== 32) throw new Error("PUSH_SUBSCRIPTION_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return decoded;
}

export function encryptPushAuthSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptPushAuthSecret(value: string): string {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Stored browser push secret has an unsupported format.");
  const key = encryptionKey();
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const encrypted = Buffer.from(parts[3], "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Stored browser push secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
