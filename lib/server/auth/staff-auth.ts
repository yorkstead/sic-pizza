/**
 * Server-authoritative Staff Authentication & Role-Based Access Control (RBAC) Engine.
 * Uses Web Crypto API for constant-time cryptographic operations and HMAC-SHA256 tokens.
 */

export type EmployeeRole =
  | "server"
  | "bartender"
  | "runner"
  | "kitchen"
  | "expo"
  | "manager"
  | "host"
  | "admin";

export type StaffPermission =
  | "TABLE_VIEW"
  | "TABLE_OPEN"
  | "TABLE_TRANSFER"
  | "TABLE_CLOSE"
  | "ITEM_PROPOSE"
  | "ITEM_APPROVE"
  | "ITEM_MODIFY"
  | "COURSE_FIRE"
  | "ITEM_VOID"
  | "ITEM_COMP"
  | "REQUEST_VIEW"
  | "REQUEST_CLAIM"
  | "REQUEST_COMPLETE"
  | "KDS_VIEW"
  | "KDS_BUMP"
  | "KDS_RECALL"
  | "MANAGER_OVERRIDE"
  | "STAGE_OVERRIDE"
  | "ANALYTICS_VIEW";

export const ROLE_PERMISSIONS: Record<EmployeeRole, readonly StaffPermission[]> = {
  server: [
    "TABLE_VIEW",
    "TABLE_OPEN",
    "TABLE_TRANSFER",
    "TABLE_CLOSE",
    "ITEM_PROPOSE",
    "ITEM_APPROVE",
    "ITEM_MODIFY",
    "COURSE_FIRE",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE",
    "KDS_VIEW"
  ],
  bartender: [
    "TABLE_VIEW",
    "ITEM_PROPOSE",
    "ITEM_APPROVE",
    "ITEM_MODIFY",
    "COURSE_FIRE",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE",
    "KDS_VIEW",
    "KDS_BUMP"
  ],
  runner: [
    "TABLE_VIEW",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE"
  ],
  kitchen: [
    "KDS_VIEW",
    "KDS_BUMP",
    "KDS_RECALL"
  ],
  expo: [
    "TABLE_VIEW",
    "KDS_VIEW",
    "KDS_BUMP",
    "KDS_RECALL",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE"
  ],
  host: [
    "TABLE_VIEW",
    "TABLE_OPEN"
  ],
  manager: [
    "TABLE_VIEW",
    "TABLE_OPEN",
    "TABLE_TRANSFER",
    "TABLE_CLOSE",
    "ITEM_PROPOSE",
    "ITEM_APPROVE",
    "ITEM_MODIFY",
    "COURSE_FIRE",
    "ITEM_VOID",
    "ITEM_COMP",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE",
    "KDS_VIEW",
    "KDS_BUMP",
    "KDS_RECALL",
    "MANAGER_OVERRIDE",
    "STAGE_OVERRIDE",
    "ANALYTICS_VIEW"
  ],
  admin: [
    "TABLE_VIEW",
    "TABLE_OPEN",
    "TABLE_TRANSFER",
    "TABLE_CLOSE",
    "ITEM_PROPOSE",
    "ITEM_APPROVE",
    "ITEM_MODIFY",
    "COURSE_FIRE",
    "ITEM_VOID",
    "ITEM_COMP",
    "REQUEST_VIEW",
    "REQUEST_CLAIM",
    "REQUEST_COMPLETE",
    "KDS_VIEW",
    "KDS_BUMP",
    "KDS_RECALL",
    "MANAGER_OVERRIDE",
    "STAGE_OVERRIDE",
    "ANALYTICS_VIEW"
  ]
};

export interface StaffSessionPayload {
  employeeId: string;
  displayName: string;
  role: EmployeeRole;
  locationId: string;
  organizationId: string;
  permissions: StaffPermission[];
  exp: number; // Unix timestamp seconds
  iat: number;
}

export interface ManagerOverrideTokenPayload {
  managerId: string;
  managerName: string;
  locationId: string;
  action: string;
  reason: string;
  exp: number;
  iat: number;
}

const AUTH_SECRET = process.env.STAFF_AUTH_SECRET || "sic_pizza_staff_auth_secret_dev_32char_key_!";

/**
 * Derives a PBKDF2-SHA256 hash from a PIN and salt.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 10000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Signs a payload with HMAC-SHA256.
 */
export async function signToken(payload: unknown, secret: string = AUTH_SECRET): Promise<string> {

  const encoder = new TextEncoder();
  const data = JSON.stringify(payload);
  const dataBase64 = Buffer.from(data, "utf8").toString("base64url");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataBase64));
  const sigBase64 = Buffer.from(signature).toString("base64url");

  return `${dataBase64}.${sigBase64}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 signed token.
 */
export async function verifyToken<T>(token: string, secret: string = AUTH_SECRET): Promise<T | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [dataBase64, sigBase64] = parts;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBuffer = Buffer.from(sigBase64, "base64url");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      encoder.encode(dataBase64)
    );

    if (!valid) return null;

    const jsonStr = Buffer.from(dataBase64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as T & { exp?: number };

    // Check expiration if present
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Seeded Demo Staff Members with pre-derived PIN hashes.
 * Salt is standard per-tenant/employee.
 */
export interface DemoStaffRecord {
  id: string;
  displayName: string;
  role: EmployeeRole;
  locationId: string;
  organizationId: string;
  pin: string; // Dev PIN
  salt: string;
}

export const DEMO_STAFF_DIRECTORY: DemoStaffRecord[] = [
  {
    id: "emp_jordan",
    displayName: "Jordan Server",
    role: "server",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "0420",
    salt: "salt_jordan_0420"
  },
  {
    id: "emp_manager",
    displayName: "Alex Manager",
    role: "manager",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "8888",
    salt: "salt_manager_8888"
  },
  {
    id: "emp_bartender",
    displayName: "Sam Bartender",
    role: "bartender",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "2468",
    salt: "salt_bartender_2468"
  },
  {
    id: "emp_runner",
    displayName: "Casey Runner",
    role: "runner",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "1111",
    salt: "salt_runner_1111"
  },
  {
    id: "emp_expo",
    displayName: "Taylor Expo",
    role: "expo",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "3333",
    salt: "salt_expo_3333"
  },
  {
    id: "emp_kitchen",
    displayName: "Mario Kitchen",
    role: "kitchen",
    locationId: "loc_downtown",
    organizationId: "sic_pizza_org",
    pin: "5555",
    salt: "salt_kitchen_5555"
  }
];

/**
 * Authenticates a staff PIN against the staff directory.
 */
export async function authenticateStaffPin(
  pin: string,
  locationId = "loc_downtown",
  employeeId?: string
): Promise<{
  success: boolean;
  token?: string;
  payload?: StaffSessionPayload;
  error?: string;
}> {
  if (!pin || pin.trim().length === 0) {
    return { success: false, error: "PIN is required." };
  }

  // Find matching employee by specific employeeId, or by matching PIN in location directory
  for (const staff of DEMO_STAFF_DIRECTORY) {
    if (employeeId && staff.id !== employeeId) continue;
    if (staff.locationId !== locationId) continue;

    const expectedHash = await hashPin(staff.pin, staff.salt);
    const providedHash = await hashPin(pin.trim(), staff.salt);

    if (timingSafeEqual(expectedHash, providedHash)) {
      const nowSec = Math.floor(Date.now() / 1000);
      const permissions = [...ROLE_PERMISSIONS[staff.role]];

      const payload: StaffSessionPayload = {
        employeeId: staff.id,
        displayName: staff.displayName,
        role: staff.role,
        locationId: staff.locationId,
        organizationId: staff.organizationId,
        permissions,
        iat: nowSec,
        exp: nowSec + 8 * 60 * 60 // 8 hour shift session
      };

      const token = await signToken(payload);
      return { success: true, token, payload };
    }
  }

  return { success: false, error: "Invalid PIN for this location." };
}

/**
 * Generates a short-lived manager override token (valid for 5 minutes).
 */
export async function createManagerOverride(
  managerPin: string,
  action: string,
  reason: string,
  locationId = "loc_downtown"
): Promise<{
  success: boolean;
  overrideToken?: string;
  managerName?: string;
  error?: string;
}> {
  const manager = DEMO_STAFF_DIRECTORY.find(
    (s) => (s.role === "manager" || s.role === "admin") && s.locationId === locationId
  );

  if (!manager) {
    return { success: false, error: "No manager registered at this location." };
  }

  const expectedHash = await hashPin(manager.pin, manager.salt);
  const providedHash = await hashPin(managerPin.trim(), manager.salt);

  if (!timingSafeEqual(expectedHash, providedHash)) {
    return { success: false, error: "Invalid Manager PIN." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ManagerOverrideTokenPayload = {
    managerId: manager.id,
    managerName: manager.displayName,
    locationId: manager.locationId,
    action,
    reason,
    iat: nowSec,
    exp: nowSec + 5 * 60 // 5-minute single-action window
  };

  const overrideToken = await signToken(payload);
  return {
    success: true,
    overrideToken,
    managerName: manager.displayName
  };
}

/**
 * Verifies if a staff session has permission for an action, or if a valid manager override exists.
 */
export async function authorizeStaffAction(
  authHeaderOrToken?: string | null,
  requiredPermission?: StaffPermission,
  overrideToken?: string | null
): Promise<{
  authorized: boolean;
  session?: StaffSessionPayload;
  managerOverride?: ManagerOverrideTokenPayload;
  error?: string;
}> {
  if (!authHeaderOrToken) {
    return { authorized: false, error: "Missing authentication token." };
  }

  const token = authHeaderOrToken.startsWith("Bearer ")
    ? authHeaderOrToken.slice(7)
    : authHeaderOrToken;

  const session = await verifyToken<StaffSessionPayload>(token);
  if (!session) {
    return { authorized: false, error: "Invalid or expired session token." };
  }

  if (!requiredPermission) {
    return { authorized: true, session };
  }

  // Check if role has inherent permission
  if (session.permissions.includes(requiredPermission)) {
    return { authorized: true, session };
  }

  // If role lacks permission, check for valid manager override
  if (overrideToken) {
    const override = await verifyToken<ManagerOverrideTokenPayload>(overrideToken);
    if (override && override.locationId === session.locationId) {
      return { authorized: true, session, managerOverride: override };
    }
  }

  return {
    authorized: false,
    session,
    error: `Permission ${requiredPermission} denied for role ${session.role}. Manager override required.`
  };
}
