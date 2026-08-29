// Re-export core platform domain
export * from "./core/types";
export * from "./core/item";
export * from "./core/order";
export * from "./core/session";
export * from "./core/events";

// Re-export demo restaurant pizza catalog logic for seamless backwards compatibility
export * from "@/lib/demo/sic-pizza/catalog";

// Backwards compatibility alias for order transition
import { transitionOrderStatus } from "./core/order";
export const transitionOrder = transitionOrderStatus;
