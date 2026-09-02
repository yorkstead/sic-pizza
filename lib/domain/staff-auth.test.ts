import { describe, expect, it } from "bun:test";
import {
  hashPin,
  ROLE_PERMISSIONS,
  signToken,
  timingSafeEqual,
  verifyPin,
  verifyToken
} from "../server/auth/staff-auth";

describe("Restaurant Operating System: Staff Authentication & Server RBAC", () => {
  it("stores a salted scrypt verifier rather than a plaintext PIN", async () => {
    const hash = await hashPin("0420", "synthetic-test-salt");
    expect(hash).not.toContain("0420");
    expect(await verifyPin("0420", hash)).toBe(true);
    expect(await verifyPin("9999", hash)).toBe(false);
  });

  it("uses constant-time comparison for equal-length values", () => {
    expect(timingSafeEqual("same", "same")).toBe(true);
    expect(timingSafeEqual("same", "diff")).toBe(false);
    expect(timingSafeEqual("short", "longer")).toBe(false);
  });

  it("keeps elevated permissions out of ordinary staff roles", () => {
    expect(ROLE_PERMISSIONS.server).toContain("COURSE_FIRE");
    expect(ROLE_PERMISSIONS.server).not.toContain("ITEM_VOID");
    expect(ROLE_PERMISSIONS.runner).not.toContain("TABLE_OPEN");
    expect(ROLE_PERMISSIONS.manager).toContain("MANAGER_OVERRIDE");
    expect(ROLE_PERMISSIONS.admin).toContain("ANALYTICS_VIEW");
  });

  it("signs auxiliary scoped tokens and detects tampering", async () => {
    const payload = { userId: "synthetic-user", exp: Math.floor(Date.now() / 1000) + 60 };
    const token = await signToken(payload, "synthetic-test-secret");
    expect((await verifyToken<typeof payload>(token, "synthetic-test-secret"))?.userId).toBe(payload.userId);
    const [, signature] = token.split(".");
    const altered = `${Buffer.from(JSON.stringify({ userId: "other" })).toString("base64url")}.${signature}`;
    expect(await verifyToken(altered, "synthetic-test-secret")).toBeNull();
  });

  it("rejects expired auxiliary tokens", async () => {
    const token = await signToken({ exp: Math.floor(Date.now() / 1000) - 1 }, "synthetic-test-secret");
    expect(await verifyToken(token, "synthetic-test-secret")).toBeNull();
  });
});
