import {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";

export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export class PushDeliveryError extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | null;
  constructor(message: string, options: { retryable: boolean; statusCode?: number | null }) {
    super(message);
    this.name = "PushDeliveryError";
    this.retryable = options.retryable;
    this.statusCode = options.statusCode ?? null;
  }
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" || host.endsWith(".fcm.googleapis.com") ||
      host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" || host.endsWith(".push.apple.com");
  } catch {
    return false;
  }
}

function hmac(key: Buffer, value: Buffer): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hkdfExtract(salt: Buffer, inputKeyMaterial: Buffer): Buffer {
  return hmac(salt.length ? salt : Buffer.alloc(32), inputKeyMaterial);
}

function hkdfExpand(pseudorandomKey: Buffer, info: Buffer, length: number): Buffer {
  const blocks: Buffer[] = [];
  let previous: ReturnType<typeof hmac> = Buffer.alloc(0);
  let generated = 0;
  let counter = 1;
  while (generated < length) {
    previous = hmac(pseudorandomKey, Buffer.concat([previous, info, Buffer.from([counter])]));
    blocks.push(previous);
    generated += previous.length;
    counter += 1;
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function buildVapidJwt(audience: string): { token: string; publicKey: string } {
  const privateKeyText = process.env.VAPID_PRIVATE_KEY?.trim();
  const publicKeyText = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || process.env.VAPID_PUBLIC_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!privateKeyText || !publicKeyText || !subject || !(subject.startsWith("mailto:") || subject.startsWith("https://"))) {
    throw new PushDeliveryError("Browser Push is not configured. Set the VAPID public key, private key and subject.", { retryable: false });
  }
  const rawPrivateKey = decodeBase64Url(privateKeyText);
  const rawPublicKey = decodeBase64Url(publicKeyText);
  if (rawPrivateKey.length !== 32 || rawPublicKey.length !== 65 || rawPublicKey[0] !== 4) {
    throw new PushDeliveryError("The configured VAPID key pair is invalid.", { retryable: false });
  }
  const privateEcdh = createECDH("prime256v1");
  privateEcdh.setPrivateKey(rawPrivateKey);
  const derivedPublicKey = privateEcdh.getPublicKey(null, "uncompressed");
  if (!derivedPublicKey.equals(rawPublicKey)) {
    throw new PushDeliveryError("The VAPID public and private keys do not match.", { retryable: false });
  }
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(rawPublicKey.subarray(1, 33)),
    y: encodeBase64Url(rawPublicKey.subarray(33, 65)),
    d: encodeBase64Url(rawPrivateKey),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encodeBase64Url(Buffer.from(JSON.stringify({ aud: audience, exp: now + 12 * 60 * 60, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const signature = cryptoSign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return { token: `${unsigned}.${encodeBase64Url(signature)}`, publicKey: publicKeyText };
}

function encryptPayload(subscription: StoredPushSubscription, payload: string): Buffer {
  const userPublicKey = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4 || authSecret.length < 16 || authSecret.length > 32) {
    throw new PushDeliveryError("The stored browser push subscription keys are invalid.", { retryable: false });
  }

  const serverECDH = createECDH("prime256v1");
  serverECDH.generateKeys();
  const serverPublicKey = serverECDH.getPublicKey(null, "uncompressed");
  const sharedSecret = serverECDH.computeSecret(userPublicKey);
  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), userPublicKey, serverPublicKey]);
  const inputKeyMaterial = hkdfExpand(authPrk, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);
  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const keyLength = Buffer.from([serverPublicKey.length]);
  return Buffer.concat([salt, recordSize, keyLength, serverPublicKey, ciphertext]);
}

export async function sendBrowserPush(subscription: StoredPushSubscription, payload: { title: string; body: string; href?: string; tag?: string }): Promise<{ statusCode: number }> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    throw new PushDeliveryError("The browser push endpoint host is not allowed.", { retryable: false });
  }
  const endpoint = new URL(subscription.endpoint);
  const vapid = buildVapidJwt(endpoint.origin);
  const safePayload = { title: payload.title.slice(0, 120), body: payload.body.slice(0, 300), ...(payload.href && payload.href.startsWith("/") && !payload.href.startsWith("//") ? { href: payload.href.slice(0, 1_500) } : {}), ...(payload.tag ? { tag: payload.tag.slice(0, 100) } : {}) };
  const payloadText = JSON.stringify(safePayload);
  if (Buffer.byteLength(payloadText, "utf8") > 3_500) throw new PushDeliveryError("The browser notification payload is too large.", { retryable: false });
  const encrypted = encryptPayload(subscription, payloadText);
  const topic = payload.tag
    ? createHash("sha256").update(payload.tag).digest().subarray(0, 16).toString("base64url")
    : undefined;
  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
        TTL: "86400",
        Urgency: "normal",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        ...(topic ? { Topic: topic } : {}),
      },
      body: new Uint8Array(encrypted),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new PushDeliveryError("The browser push service could not be reached.", { retryable: true });
  }
  if (response.status === 404 || response.status === 410) {
    throw new PushDeliveryError("The browser push subscription has expired.", { retryable: false, statusCode: response.status });
  }
  if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
    throw new PushDeliveryError(`The browser push service returned ${response.status}.`, { retryable: true, statusCode: response.status });
  }
  if (!response.ok && response.status !== 201 && response.status !== 202) {
    throw new PushDeliveryError(`The browser push service rejected the delivery (${response.status}).`, { retryable: false, statusCode: response.status });
  }
  return { statusCode: response.status };
}
