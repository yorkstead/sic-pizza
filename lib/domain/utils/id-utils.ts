import { createHash } from "crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks if a string is a valid standard UUID format.
 */
export function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Deterministically maps any arbitrary string ID (e.g. "sess_11", "emp_jordan", "tbl_11")
 * into a valid, standard UUID v5-like string using SHA-256 namespace hashing.
 * If the input is already a valid UUID, returns it unchanged.
 */
export function ensureUuid(id: string): string {
  if (isUuid(id)) {
    return id.toLowerCase();
  }

  const hash = createHash("sha256").update(`sic_pizza_ns:${id}`).digest("hex");
  // Format as standard 8-4-4-4-12 UUID (variant RFC 4122, version 5)
  const part1 = hash.substring(0, 8);
  const part2 = hash.substring(8, 12);
  const part3 = `5${hash.substring(13, 16)}`; // Version 5
  const variantNibble = (parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8;
  const part4 = `${variantNibble.toString(16)}${hash.substring(17, 20)}`;
  const part5 = hash.substring(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
}

/**
 * Produces a stable SHA-256 hash of any JSON-serializable request payload for idempotency checking.
 */
export function hashPayload(payload: unknown): string {
  if (payload === undefined || payload === null) {
    return createHash("sha256").update("null").digest("hex");
  }
  const serialized = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
  return createHash("sha256").update(serialized).digest("hex");
}
