import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import { ensureUuid } from "@/lib/domain/utils/id-utils";

export type EmployeeRole = "server" | "bartender" | "runner" | "kitchen" | "expo" | "manager" | "host" | "admin";
export type StaffPermission = "TABLE_VIEW" | "TABLE_OPEN" | "TABLE_TRANSFER" | "TABLE_CLOSE" | "ITEM_PROPOSE" | "ITEM_APPROVE" | "ITEM_MODIFY" | "COURSE_FIRE" | "ITEM_VOID" | "ITEM_COMP" | "REQUEST_VIEW" | "REQUEST_CLAIM" | "REQUEST_COMPLETE" | "KDS_VIEW" | "KDS_BUMP" | "KDS_RECALL" | "MANAGER_OVERRIDE" | "STAGE_OVERRIDE" | "ANALYTICS_VIEW";

const base = ["TABLE_VIEW", "ITEM_PROPOSE", "ITEM_APPROVE", "ITEM_MODIFY", "REQUEST_VIEW", "REQUEST_CLAIM", "REQUEST_COMPLETE"] as StaffPermission[];
const elevated = ["TABLE_OPEN", "TABLE_TRANSFER", "TABLE_CLOSE", "COURSE_FIRE", "ITEM_VOID", "ITEM_COMP", "KDS_VIEW", "KDS_BUMP", "KDS_RECALL", "MANAGER_OVERRIDE", "STAGE_OVERRIDE", "ANALYTICS_VIEW"] as StaffPermission[];
export const ROLE_PERMISSIONS: Record<EmployeeRole, readonly StaffPermission[]> = {
  server: [...base, "TABLE_OPEN", "TABLE_TRANSFER", "TABLE_CLOSE", "COURSE_FIRE", "KDS_VIEW"],
  bartender: [...base, "COURSE_FIRE", "KDS_VIEW", "KDS_BUMP"], runner: ["TABLE_VIEW", "REQUEST_VIEW", "REQUEST_CLAIM", "REQUEST_COMPLETE"],
  kitchen: ["KDS_VIEW", "KDS_BUMP", "KDS_RECALL"], expo: ["TABLE_VIEW", "KDS_VIEW", "KDS_BUMP", "KDS_RECALL", "REQUEST_VIEW", "REQUEST_CLAIM", "REQUEST_COMPLETE"],
  host: ["TABLE_VIEW", "TABLE_OPEN"], manager: [...base, ...elevated], admin: [...base, ...elevated]
};

export const STAFF_SESSION_COOKIE = "sic_staff_session";
export const STAFF_DEVICE_COOKIE = "sic_staff_device";
export const STAFF_SESSION_SECONDS = 8 * 60 * 60;
export interface StaffSessionPayload { employeeId: string; displayName: string; role: EmployeeRole; locationId: string; organizationId: string; permissions: StaffPermission[]; exp: number; iat: number }
export interface ManagerOverrideTokenPayload { managerId: string; managerName: string; locationId: string; action: string; reason: string; exp: number; iat: number }

const scrypt = promisify(scryptCallback);
let authPool: Pool | undefined;
function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("Staff authentication requires DATABASE_URL.");
  return authPool ??= new Pool({ connectionString: process.env.DATABASE_URL });
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && cryptoTimingSafeEqual(left, right);
}
function auxiliaryTokenSecret(): string {
  if (process.env.STAFF_AUTH_SECRET) return process.env.STAFF_AUTH_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("STAFF_AUTH_SECRET is required for manager override tokens.");
  return "test-only-auth-secret";
}
export async function signToken(payload: unknown, secret = auxiliaryTokenSecret()): Promise<string> {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return `${encoded}.${Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded))).toString("base64url")}`;
}
export async function verifyToken<T>(token: string, secret = auxiliaryTokenSecret()): Promise<T | null> {
  try {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, Buffer.from(signature, "base64url"), new TextEncoder().encode(encoded))) return null;
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T & { exp?: number };
    return value.exp && value.exp < Math.floor(Date.now()/1000) ? null : value;
  } catch { return null; }
}
function cookie(request: Request, name: string): string | undefined {
  return (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function tokenFrom(source?: string | Request | null): string | undefined {
  if (!source) return undefined;
  if (typeof source !== "string") return cookie(source, STAFF_SESSION_COOKIE);
  return source.startsWith("Bearer ") ? source.slice(7) : source;
}
function fingerprint(request?: Request): string {
  if (!request) return "server-auth-call";
  return `${request.headers.get("user-agent") ?? "unknown"}|${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
}

export async function hashPin(pin: string, salt = randomBytes(16).toString("hex")): Promise<string> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Staff PIN must contain 4 to 8 digits.");
  const derived = await scrypt(pin, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^\d{4,8}$/.test(pin)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(pin, salt, expected.length) as Buffer;
  return expected.length === actual.length && cryptoTimingSafeEqual(expected, actual);
}

export async function authenticateStaffPin(pin: string, locationId = "loc_downtown", employeeId?: string, context: { request?: Request; deviceToken?: string; deviceLabel?: string } = {}) {
  const db = pool(), location = ensureUuid(locationId), deviceFingerprint = digest(fingerprint(context.request));
  const recent = await db.query<{ count: string }>(`SELECT count(*)::text count FROM staff_login_attempts WHERE location_id=$1 AND device_fingerprint_hash=$2 AND successful=false AND attempted_at > now()-interval '15 minutes'`, [location, deviceFingerprint]);
  if (Number(recent.rows[0]?.count ?? 0) >= 5) return { success: false as const, status: 429, error: "Too many failed PIN attempts. Try again in 15 minutes." };
  const selectedId = employeeId ? ensureUuid(employeeId) : null;
  const candidates = await db.query<{ id:string; display_name:string; pin_hash:string; role:EmployeeRole; location_id:string; organization_id:string }>(`SELECT e.id,e.display_name,e.pin_hash,e.role,e.location_id,l.organization_id FROM employees e JOIN locations l ON l.id=e.location_id WHERE e.location_id=$1 AND e.active AND l.active AND ($2::uuid IS NULL OR e.id=$2)`, [location, selectedId]);
  let employee: typeof candidates.rows[number] | undefined;
  for (const candidate of candidates.rows) if (await verifyPin(pin.trim(), candidate.pin_hash)) { employee = candidate; break; }
  await db.query(`INSERT INTO staff_login_attempts(location_id,employee_id,device_fingerprint_hash,successful) VALUES($1,$2,$3,$4)`, [location, employee?.id ?? selectedId, deviceFingerprint, Boolean(employee)]);
  if (!employee) return { success: false as const, status: 401, error: "Invalid PIN for this location." };

  const deviceToken = context.deviceToken || randomBytes(32).toString("base64url");
  const enrolled = await db.query<{ id:string }>(`INSERT INTO staff_devices(location_id,device_token_hash,label) VALUES($1,$2,$3) ON CONFLICT(device_token_hash) DO UPDATE SET last_seen_at=now() WHERE staff_devices.active AND staff_devices.revoked_at IS NULL RETURNING id`, [location, digest(deviceToken), context.deviceLabel ?? "POS device"]);
  if (!enrolled.rows[0]) return { success: false as const, status: 401, error: "This device enrollment has been revoked." };
  const sessionToken = randomBytes(32).toString("base64url");
  const created = await db.query<{ created_at:Date; expires_at:Date }>(`INSERT INTO staff_sessions(employee_id,location_id,device_id,session_token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '8 hours') RETURNING created_at,expires_at`, [employee.id, location, enrolled.rows[0].id, digest(sessionToken)]);
  const session = created.rows[0];
  const payload: StaffSessionPayload = { employeeId:employee.id, displayName:employee.display_name, role:employee.role, locationId:employee.location_id, organizationId:employee.organization_id, permissions:[...ROLE_PERMISSIONS[employee.role]], iat:Math.floor(session.created_at.getTime()/1000), exp:Math.floor(session.expires_at.getTime()/1000) };
  return { success: true as const, token: sessionToken, deviceToken, payload };
}

export async function authorizeStaffAction(source?: string | Request | null, requiredPermission?: StaffPermission, overrideToken?: string | null) {
  const token = tokenFrom(source);
  if (!token) return { authorized:false as const, error:"Missing staff session." };
  const result = await pool().query<{ employee_id:string; display_name:string; role:EmployeeRole; location_id:string; organization_id:string; created_at:Date; expires_at:Date }>(`SELECT s.employee_id,e.display_name,e.role,s.location_id,l.organization_id,s.created_at,s.expires_at FROM staff_sessions s JOIN employees e ON e.id=s.employee_id JOIN locations l ON l.id=s.location_id JOIN staff_devices d ON d.id=s.device_id WHERE s.session_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND e.active AND l.active AND d.active AND d.revoked_at IS NULL`, [digest(token)]);
  const row = result.rows[0];
  if (!row) return { authorized:false as const, error:"Invalid, expired, or revoked staff session." };
  await pool().query(`UPDATE staff_sessions SET last_seen_at=now() WHERE session_token_hash=$1`, [digest(token)]);
  const session: StaffSessionPayload = { employeeId:row.employee_id, displayName:row.display_name, role:row.role, locationId:row.location_id, organizationId:row.organization_id, permissions:[...ROLE_PERMISSIONS[row.role]], iat:Math.floor(row.created_at.getTime()/1000), exp:Math.floor(row.expires_at.getTime()/1000) };
  if (!requiredPermission || session.permissions.includes(requiredPermission)) return { authorized:true as const, session, managerOverride: undefined };
  if (overrideToken) {
    const managerOverride = await verifyToken<ManagerOverrideTokenPayload>(overrideToken);
    if (managerOverride && managerOverride.locationId === session.locationId) return { authorized:true as const, session, managerOverride };
  }
  return { authorized:false as const, session, error:`Permission ${requiredPermission} denied for role ${session.role}. Manager override required.` };
}

export async function revokeStaffSession(source?: string | Request | null): Promise<void> {
  const token = tokenFrom(source);
  if (token) await pool().query(`UPDATE staff_sessions SET revoked_at=now() WHERE session_token_hash=$1 AND revoked_at IS NULL`, [digest(token)]);
}

export async function createManagerOverride(managerPin: string, action: string, reason: string, locationId = "loc_downtown") {
  const auth = await authenticateStaffPin(managerPin, locationId);
  if (!auth.success || !auth.payload || !["manager", "admin"].includes(auth.payload.role)) {
    if (auth.success) await revokeStaffSession(auth.token);
    return { success:false as const, error:"Invalid Manager PIN." };
  }
  await revokeStaffSession(auth.token);
  const now = Math.floor(Date.now()/1000);
  const payload: ManagerOverrideTokenPayload = { managerId:auth.payload.employeeId, managerName:auth.payload.displayName, locationId:auth.payload.locationId, action, reason, iat:now, exp:now+300 };
  return { success:true as const, overrideToken:await signToken(payload), managerName:payload.managerName };
}

export function resetStaffAuthPool(): void { const previous=authPool; authPool=undefined; if(previous) void previous.end(); }
