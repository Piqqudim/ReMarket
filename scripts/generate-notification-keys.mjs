import { createECDH, randomBytes } from 'node:crypto';

const ecdh = createECDH('prime256v1');
const publicKey = ecdh.generateKeys(undefined, 'uncompressed');
const privateKey = ecdh.getPrivateKey();
const b64url = (value) => value.toString('base64url');

console.log('# Add these values to your server environment. Keep the private/encryption keys secret.');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(publicKey)}`);
console.log(`VAPID_PRIVATE_KEY=${b64url(privateKey)}`);
console.log(`PUSH_SUBSCRIPTION_ENCRYPTION_KEY=${b64url(randomBytes(32))}`);
console.log('VAPID_SUBJECT=mailto:notifications@your-verified-domain.example');
