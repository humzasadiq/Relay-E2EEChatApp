"use client";

// `libsodium-wrappers` (core) ships without argon2id; the `-sumo` build
// adds the password-hashing primitives we need to wrap private keys.
import sodium from "libsodium-wrappers-sumo";

/**
 * Relay E2EE — libsodium-only scheme (study-project flavour).
 *
 *   Identity keypair   Ed25519   (sign/verify)
 *   Exchange keypair   X25519    (sealed-box for wrapping conv keys)
 *   Conv key           32-byte   (secretbox for messages)
 *   Private keys       JSON      argon2id(password,salt) -> secretbox
 *
 * `crypto_box_seal` gives us anonymous, one-shot public-key encryption:
 * the recipient's exchangePubKey wraps the conv key; the recipient opens
 * with their own keypair. No sender key exchange needed.
 */

let ready: Promise<void> | null = null;
function sodiumReady(): Promise<void> {
  if (!ready) ready = sodium.ready;
  return ready;
}

/* ── encoding helpers ────────────────────────────────────────────── */

function b64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}
function fromB64(s: string): Uint8Array {
  return sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
}
function bytes(s: string): Uint8Array {
  return sodium.from_string(s);
}
function text(b: Uint8Array): string {
  return sodium.to_string(b);
}

/* ── bundle shapes ───────────────────────────────────────────────── */

export interface PublicKeyBundle {
  identityPubKey: string;
  exchangePubKey: string;
}

/** Kept unwrapped in memory while signed in. */
export interface PrivateKeyBundle {
  identityPrivKey: string;
  exchangePrivKey: string;
  identityPubKey: string;
  exchangePubKey: string;
}

/** Shape stored inside `wrappedPrivateKeys`. Server treats as opaque. */
interface WrappedBlob {
  v: 1;
  salt: string;
  nonce: string;
  ciphertext: string;
}

/* ── key generation & wrap / unwrap ──────────────────────────────── */

export async function generateKeyBundle(password: string): Promise<{
  publicBundle: PublicKeyBundle;
  privateBundle: PrivateKeyBundle;
  wrappedPrivateKeys: string;
}> {
  await sodiumReady();
  const id = sodium.crypto_sign_keypair();
  const ex = sodium.crypto_box_keypair();

  const privateBundle: PrivateKeyBundle = {
    identityPrivKey: b64(id.privateKey),
    exchangePrivKey: b64(ex.privateKey),
    identityPubKey: b64(id.publicKey),
    exchangePubKey: b64(ex.publicKey),
  };
  const publicBundle: PublicKeyBundle = {
    identityPubKey: b64(id.publicKey),
    exchangePubKey: b64(ex.publicKey),
  };
  const wrappedPrivateKeys = await wrapPrivateKeys(privateBundle, password);
  return { publicBundle, privateBundle, wrappedPrivateKeys };
}

export async function wrapPrivateKeys(
  bundle: PrivateKeyBundle,
  password: string,
): Promise<string> {
  await sodiumReady();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = bytes(JSON.stringify(bundle));
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);
  const blob: WrappedBlob = {
    v: 1,
    salt: b64(salt),
    nonce: b64(nonce),
    ciphertext: b64(ciphertext),
  };
  return JSON.stringify(blob);
}

export async function unwrapPrivateKeys(
  wrapped: string,
  password: string,
): Promise<PrivateKeyBundle> {
  await sodiumReady();
  const blob = JSON.parse(wrapped) as WrappedBlob;
  const salt = fromB64(blob.salt);
  const nonce = fromB64(blob.nonce);
  const ciphertext = fromB64(blob.ciphertext);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  return JSON.parse(text(plaintext)) as PrivateKeyBundle;
}

/* ── conversation key wrap / unwrap (anonymous sealed box) ───────── */

/** Generate a fresh 32-byte conversation key (raw bytes, base64). */
export async function generateConversationKey(): Promise<string> {
  await sodiumReady();
  return b64(sodium.crypto_secretbox_keygen());
}

/** Wrap a conv key for one recipient using their X25519 public key. */
export async function wrapConversationKey(
  convKey: string,
  recipientExchangePubKey: string,
): Promise<string> {
  await sodiumReady();
  const sealed = sodium.crypto_box_seal(
    fromB64(convKey),
    fromB64(recipientExchangePubKey),
  );
  return b64(sealed);
}

/** Unwrap my wrapped copy using my X25519 keypair. */
export async function unwrapConversationKey(
  wrapped: string,
  myExchangePubKey: string,
  myExchangePrivKey: string,
): Promise<string> {
  await sodiumReady();
  const convKey = sodium.crypto_box_seal_open(
    fromB64(wrapped),
    fromB64(myExchangePubKey),
    fromB64(myExchangePrivKey),
  );
  return b64(convKey);
}

/* ── message encrypt / decrypt (secretbox) ───────────────────────── */

export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
}

export async function encryptMessage(
  plaintext: string,
  convKey: string,
): Promise<EncryptedMessage> {
  await sodiumReady();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    bytes(plaintext),
    nonce,
    fromB64(convKey),
  );
  return { ciphertext: b64(ciphertext), nonce: b64(nonce) };
}

export async function decryptMessage(
  ciphertext: string,
  nonce: string,
  convKey: string,
): Promise<string> {
  await sodiumReady();
  const plaintext = sodium.crypto_secretbox_open_easy(
    fromB64(ciphertext),
    fromB64(nonce),
    fromB64(convKey),
  );
  return text(plaintext);
}
