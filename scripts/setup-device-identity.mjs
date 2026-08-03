#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/setup-device-identity.mjs
//
// Generate an OpenClaw operator device identity for the ClawSprawl SSR server.
//
// OpenClaw 2026.7.2-beta.6+ enforces device identity for the `openclaw-control-ui`
// operator client and grants no operator scopes to the reserved loopback `backend`
// path. To read gateway data (agents, models, sessions, ...) the dashboard must
// connect as a *paired* operator device:
//
//   1. Run this script — it prints an Ed25519 keypair + the derived device id.
//   2. Set the printed CLAWSPRAWL_DEVICE_* env vars (and keep the private key
//      secret — e.g. in a gitignored `.env`).
//   3. Start the dashboard; it connects with the device identity, creating a
//      pending pairing request on the gateway.
//   4. Approve the request on the gateway host:
//        openclaw devices list          # see the pending request
//        openclaw devices approve <id>  # grants operator.read
//   5. The dashboard reconnects and receives operator.read + a deviceToken.
//
// The device id is the SHA-256 of the raw 32-byte Ed25519 public key, hex-encoded
// (64 chars) — matching the gateway's device-identity check.
// ---------------------------------------------------------------------------

import { generateKeyPairSync, createHash } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const der = publicKey.export({ type: 'spki', format: 'der' });
const raw = der.subarray(der.length - 32); // Ed25519 raw public key (last 32 bytes of SPKI DER)
const deviceId = createHash('sha256').update(raw).digest('hex');

const env = (name, value) => `${name}=${value}`;

console.log('OpenClaw operator device identity for ClawSprawl\n');
console.log('Add these to your .env (gitignored). Keep the private key secret:\n');
console.log(env('CLAWSPRAWL_DEVICE_ID', deviceId));
console.log('CLAWSPRAWL_DEVICE_PUBLIC_KEY=<see public-key file below>');
console.log('CLAWSPRAWL_DEVICE_PRIVATE_KEY=<see private-key file below>');
console.log('');
console.log('Public key (PEM):');
console.log(pubPem);
console.log('Private key (PEM) — secret:');
console.log(privPem);
console.log('Next: start the dashboard, then on the gateway host run:');
console.log(`  openclaw devices list`);
console.log(`  openclaw devices approve ${deviceId}`);