import { base64url, EncryptJWT, errors, jwtDecrypt } from "jose";

export type StandaloneSession = Readonly<{
  provider: string;
  externalSubject: string;
  email: string;
  displayName: string;
  csrfToken: string;
}>;

export type OidcLoginFlow = Readonly<{
  codeVerifier: string;
  nonce: string;
  state: string;
  returnTo: string;
}>;

const ALGORITHM = "dir";
const ENCRYPTION = "A256GCM";

export async function sealStandaloneSession(value: StandaloneSession, secret: string, ttlSeconds: number) {
  return seal({ kind: "session", ...value }, secret, ttlSeconds);
}

export async function openStandaloneSession(token: string | undefined, secret: string): Promise<StandaloneSession | null> {
  const payload = await open(token, secret);
  if (!payload || payload.kind !== "session") return null;
  const { provider, externalSubject, email, displayName, csrfToken } = payload;
  if (![provider, externalSubject, email, displayName, csrfToken].every((value) => typeof value === "string" && value.length > 0)) return null;
  return { provider, externalSubject, email, displayName, csrfToken } as StandaloneSession;
}

export async function sealOidcLoginFlow(value: OidcLoginFlow, secret: string) {
  return seal({ kind: "oidc-flow", ...value }, secret, 600);
}

export async function openOidcLoginFlow(token: string | undefined, secret: string): Promise<OidcLoginFlow | null> {
  const payload = await open(token, secret);
  if (!payload || payload.kind !== "oidc-flow") return null;
  const { codeVerifier, nonce, state, returnTo } = payload;
  if (![codeVerifier, nonce, state, returnTo].every((value) => typeof value === "string" && value.length > 0)) return null;
  return { codeVerifier, nonce, state, returnTo } as OidcLoginFlow;
}

export function sessionKey(secret: string): Uint8Array {
  let key: Uint8Array;
  try { key = base64url.decode(secret); } catch { throw new Error("OIDC_SESSION_SECRET must be base64url encoded."); }
  if (key.byteLength !== 32) throw new Error("OIDC_SESSION_SECRET must decode to exactly 32 bytes.");
  return key;
}

async function seal(payload: Record<string, unknown>, secret: string, ttlSeconds: number) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM, enc: ENCRYPTION })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .encrypt(sessionKey(secret));
}

async function open(token: string | undefined, secret: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const result = await jwtDecrypt(token, sessionKey(secret), { keyManagementAlgorithms: [ALGORITHM], contentEncryptionAlgorithms: [ENCRYPTION], clockTolerance: 5 });
    return result.payload;
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }
}
