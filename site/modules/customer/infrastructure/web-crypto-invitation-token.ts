import type { InvitationTokenPort } from "../application/ports.ts";

export class WebCryptoInvitationToken implements InvitationTokenPort {
  async create(): Promise<{ rawToken: string; tokenHash: string }> {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const rawToken = base64Url(bytes);
    return { rawToken, tokenHash: await this.hash(rawToken) };
  }

  async hash(rawToken: string): Promise<string> {
    const value = rawToken.trim();
    if (value.length < 32 || value.length > 512) return invalidTokenHash();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function invalidTokenHash(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("invalid-invitation-token"));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
