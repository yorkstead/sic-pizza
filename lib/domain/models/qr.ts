import { z } from "zod";

export const qrTokenPayloadSchema = z.object({
  sessionId: z.string(),
  tableLabel: z.string(),
  epoch: z.number().int(),
  signature: z.string()
});
export type QRTokenPayload = z.infer<typeof qrTokenPayloadSchema>;

const DEFAULT_SECRET = "sic_pizza_rotating_qr_secret_2026";
const WINDOW_DURATION_MS = 5 * 60 * 1000; // 5 minutes rolling window

/**
 * Generates a rotating time-bounded QR code token for a live table session.
 * Prevents old screenshots from providing indefinite restaurant access.
 */
export function generateRotatingQRToken(
  sessionId: string,
  tableLabel: string,
  secret: string = DEFAULT_SECRET,
  now: Date = new Date()
): string {
  const epoch = Math.floor(now.getTime() / WINDOW_DURATION_MS);
  const signature = createSimpleSignature(`${sessionId}:${tableLabel}:${epoch}:${secret}`);
  const payload: QRTokenPayload = {
    sessionId,
    tableLabel,
    epoch,
    signature
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Validates a rotating QR token. Accepts current window and immediate previous window (10 min grace period).
 */
export function validateRotatingQRToken(
  token: string,
  sessionId: string,
  secret: string = DEFAULT_SECRET,
  now: Date = new Date()
): { valid: boolean; reason?: string; payload?: QRTokenPayload } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const payload = qrTokenPayloadSchema.parse(JSON.parse(raw));

    if (payload.sessionId !== sessionId) {
      return { valid: false, reason: "Token does not match active table session" };
    }

    const currentEpoch = Math.floor(now.getTime() / WINDOW_DURATION_MS);
    // Allow current epoch and previous epoch (grace period for network latency / active scans)
    if (payload.epoch < currentEpoch - 1) {
      return { valid: false, reason: "QR code expired. Please scan the current code on your table display." };
    }
    if (payload.epoch > currentEpoch + 1) {
      return { valid: false, reason: "Invalid future timestamp on QR code." };
    }

    const expectedSig = createSimpleSignature(`${payload.sessionId}:${payload.tableLabel}:${payload.epoch}:${secret}`);
    if (payload.signature !== expectedSig) {
      return { valid: false, reason: "Invalid QR code signature" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "Malformed or invalid QR token" };
  }
}

function createSimpleSignature(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
