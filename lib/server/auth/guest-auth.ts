/**
 * Server-authoritative Guest Authentication & Scoped Token System.
 * Signs and verifies cryptographically secure HMAC-SHA256 guest join tokens and scoped session tokens.
 */

import { signToken, verifyToken } from "./staff-auth";

export interface GuestJoinTokenPayload {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  locationId: string;
  organizationId: string;
  nonce: string;
  exp: number; // Unix timestamp seconds
  iat: number;
}

export interface ScopedGuestSessionPayload {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  dinerId: string;
  dinerName: string;
  locationId: string;
  organizationId: string;
  role: "guest";
  exp: number;
  iat: number;
}

const GUEST_SECRET = process.env.GUEST_AUTH_SECRET || "sic_pizza_guest_token_secret_2026_dev_key!";
const JOIN_TOKEN_TTL_SEC = 2 * 60 * 60; // 2 hours valid QR scan window
const SESSION_TOKEN_TTL_SEC = 6 * 60 * 60; // 6 hours guest dining session

/**
 * Generates a signed, verifiable guest join token for a table session.
 */
export async function generateGuestJoinToken(params: {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  locationId: string;
  organizationId: string;
}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

  const payload: GuestJoinTokenPayload = {
    sessionId: params.sessionId,
    tableId: params.tableId,
    tableLabel: params.tableLabel,
    locationId: params.locationId,
    organizationId: params.organizationId,
    nonce,
    iat: nowSec,
    exp: nowSec + JOIN_TOKEN_TTL_SEC
  };

  return signToken(payload, GUEST_SECRET);
}

/**
 * Verifies a guest join token.
 */
export async function verifyGuestJoinToken(token: string): Promise<GuestJoinTokenPayload | null> {
  return verifyToken<GuestJoinTokenPayload>(token, GUEST_SECRET);
}

/**
 * Creates a scoped session token for an authenticated diner within a table session.
 */
export async function createScopedGuestToken(params: {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  dinerId: string;
  dinerName: string;
  locationId: string;
  organizationId: string;
}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ScopedGuestSessionPayload = {
    sessionId: params.sessionId,
    tableId: params.tableId,
    tableLabel: params.tableLabel,
    dinerId: params.dinerId,
    dinerName: params.dinerName,
    locationId: params.locationId,
    organizationId: params.organizationId,
    role: "guest",
    iat: nowSec,
    exp: nowSec + SESSION_TOKEN_TTL_SEC
  };

  return signToken(payload, GUEST_SECRET);
}

/**
 * Authorizes a guest request using their scoped guest session token.
 */
export async function authorizeGuestSession(
  authHeaderOrToken?: string | null
): Promise<{
  authorized: boolean;
  guest?: ScopedGuestSessionPayload;
  error?: string;
}> {
  if (!authHeaderOrToken) {
    return { authorized: false, error: "Missing guest authorization token." };
  }

  const token = authHeaderOrToken.startsWith("Bearer ")
    ? authHeaderOrToken.slice(7)
    : authHeaderOrToken;

  const guest = await verifyToken<ScopedGuestSessionPayload>(token, GUEST_SECRET);
  if (!guest || guest.role !== "guest") {
    return { authorized: false, error: "Invalid or expired guest session token." };
  }

  return { authorized: true, guest };
}
