import { z } from "zod";
import { courseSchema, normalizeCourse, type Course } from "./menu";
import type { TableSession } from "./session";

export const pacingModeSchema = z.enum([
  "ASAP",
  "HOLD",
  "FIRE_NOW",
  "FIRE_AT_TIME",
  "FIRE_AFTER_COURSE"
]);
export type PacingMode = z.infer<typeof pacingModeSchema>;

export const coursePacingDirectiveSchema = z.object({
  course: courseSchema,
  mode: pacingModeSchema.default("HOLD"),
  targetFireTime: z.string().optional(),
  dependsOnCourse: courseSchema.optional(),
  delayMinutesAfterDependency: z.number().int().nonnegative().default(0),
  estimatedPrepMinutes: z.number().int().positive().default(12)
});
export type CoursePacingDirective = z.infer<typeof coursePacingDirectiveSchema>;

export interface CoursePacingState {
  course: Course;
  normalizedCourse: Course;
  pacingMode: PacingMode;
  status: "unfired" | "fired" | "in_prep" | "ready" | "delivered";
  itemsCount: number;
  deliveredItemsCount: number;
  readyItemsCount: number;
  estimatedPrepMinutes: number;
  targetFireTime?: string;
  dependsOnCourse?: Course;
  firedAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  shouldFireNow: boolean;
  recommendationReason?: string;
  urgency: "urgent" | "high" | "normal" | "low";
  suggestedAction?: "FIRE_NOW" | "HOLD" | "CHECK_EXPO" | "CLEAR_TABLE" | "OFFER_DESSERT";
}

export interface TableCoursePacingSummary {
  sessionId: string;
  tableLabel: string;
  activeCourse?: Course;
  nextSuggestedFireCourse?: Course;
  courses: CoursePacingState[];
  serverPacingMessage: string;
  hasPacingAlert: boolean;
}

export const DEFAULT_PREP_ESTIMATES_MINUTES: Record<string, number> = {
  drinks: 4,
  starters: 8,
  appetizer: 8,
  salad: 6,
  mains: 15,
  entree: 15,
  desserts: 7,
  dessert: 7,
  custom: 10
};

/**
 * Derives comprehensive course pacing states and smart server recommendations for a dining session.
 */
export function deriveTableCoursePacing(
  session: TableSession,
  now: Date = new Date(),
  customDirectives: Record<string, Partial<CoursePacingDirective>> = {}
): TableCoursePacingSummary {
  // Group non-voided items by course
  const activeItems = session.items.filter((i) => i.status !== "voided");
  const courseOrder: Course[] = ["drinks", "starters", "salad", "mains", "desserts", "custom"];

  // Find all distinct courses present on the table
  const presentCourses = Array.from(new Set(activeItems.map((i) => normalizeCourse(i.course))));

  // Sort by canonical progression
  const sortedPresentCourses = courseOrder.filter((c) => presentCourses.includes(c));

  const courseStates: CoursePacingState[] = sortedPresentCourses.map((c, index) => {
    const items = activeItems.filter((i) => normalizeCourse(i.course) === c);
    const tickets = session.tickets.filter((t) => normalizeCourse(t.course) === c && t.status !== "cancelled");

    // Course status derivation
    const allDelivered = items.length > 0 && items.every((i) => i.status === "delivered");
    const allReady = items.length > 0 && items.every((i) => i.status === "ready" || i.status === "delivered");
    const anyInPrep = items.some((i) => i.status === "preparing") || tickets.some((t) => t.status === "in_prep" || t.status === "accepted");
    const anyFired = items.some((i) => i.status === "fired" || i.status === "preparing" || i.status === "ready" || i.status === "delivered") || tickets.length > 0;

    let status: CoursePacingState["status"] = "unfired";
    if (allDelivered) status = "delivered";
    else if (allReady) status = "ready";
    else if (anyInPrep) status = "in_prep";
    else if (anyFired) status = "fired";

    const customDirective = customDirectives[c] || {};

    // Default pacing mode logic:
    // Drinks -> ASAP
    // Starters -> ASAP
    // Mains -> FIRE_AFTER_COURSE (after starters) or HOLD if no starters
    // Desserts -> HOLD
    let defaultMode: PacingMode = "HOLD";
    let defaultDependency: Course | undefined = undefined;

    if (c === "drinks" || c === "starters" || (c === "mains" && !presentCourses.includes("starters") && !presentCourses.includes("salad"))) {
      defaultMode = "ASAP";
    } else if (c === "salad" && presentCourses.includes("starters")) {
      defaultMode = "FIRE_AFTER_COURSE";
      defaultDependency = "starters";
    } else if (c === "mains") {
      defaultMode = "FIRE_AFTER_COURSE";
      defaultDependency = presentCourses.includes("salad") ? "salad" : (presentCourses.includes("starters") ? "starters" : undefined);
    } else if (c === "desserts") {
      defaultMode = "HOLD";
      defaultDependency = "mains";
    }

    const pacingMode: PacingMode = customDirective.mode || defaultMode;
    const dependsOnCourse: Course | undefined = customDirective.dependsOnCourse || defaultDependency;
    const estimatedPrepMinutes = customDirective.estimatedPrepMinutes || DEFAULT_PREP_ESTIMATES_MINUTES[c] || 12;

    const deliveredItemsCount = items.filter((i) => i.status === "delivered").length;
    const readyItemsCount = items.filter((i) => i.status === "ready").length;

    // Determine oldest ticket timestamps
    const ticketCreatedTimes = tickets.map((t) => new Date(t.createdAt).getTime()).filter((t) => !isNaN(t));
    const ticketDeliveredTimes = tickets.map((t) => t.deliveredAt ? new Date(t.deliveredAt).getTime() : 0).filter((t) => t > 0);

    const firedAt = ticketCreatedTimes.length > 0 ? new Date(Math.min(...ticketCreatedTimes)).toISOString() : undefined;
    const deliveredAt = ticketDeliveredTimes.length > 0 ? new Date(Math.max(...ticketDeliveredTimes)).toISOString() : undefined;

    // Check firing recommendation logic
    let shouldFireNow = false;
    let recommendationReason: string | undefined = undefined;
    let urgency: CoursePacingState["urgency"] = "normal";
    let suggestedAction: CoursePacingState["suggestedAction"] = undefined;

    if (status === "unfired") {
      if (pacingMode === "ASAP" || pacingMode === "FIRE_NOW") {
        shouldFireNow = true;
        recommendationReason = `${c.toUpperCase()} queued for immediate firing`;
        urgency = "high";
        suggestedAction = "FIRE_NOW";
      } else if (pacingMode === "FIRE_AT_TIME" && customDirective.targetFireTime) {
        const targetMs = new Date(customDirective.targetFireTime).getTime();
        if (now.getTime() >= targetMs) {
          shouldFireNow = true;
          recommendationReason = `Scheduled fire time reached for ${c.toUpperCase()}`;
          urgency = "high";
          suggestedAction = "FIRE_NOW";
        }
      } else if (pacingMode === "FIRE_AFTER_COURSE" && dependsOnCourse) {
        const depItems = activeItems.filter((i) => normalizeCourse(i.course) === dependsOnCourse);
        const isDepDelivered = depItems.length > 0 && depItems.every((i) => i.status === "delivered");

        if (isDepDelivered) {
          shouldFireNow = true;
          recommendationReason = `${dependsOnCourse.toUpperCase()} delivered · Suggested fire: NOW`;
          urgency = "high";
          suggestedAction = "FIRE_NOW";
        }
      } else if (index === 0 && (c === "drinks" || c === "starters")) {
        shouldFireNow = true;
        recommendationReason = `First course (${c.toUpperCase()}) waiting on server fire`;
        urgency = "normal";
        suggestedAction = "FIRE_NOW";
      }
    } else if (status === "ready") {
      suggestedAction = "CHECK_EXPO";
    }

    return {
      course: c,
      normalizedCourse: c,
      pacingMode,
      status,
      itemsCount: items.length,
      deliveredItemsCount,
      readyItemsCount,
      estimatedPrepMinutes,
      targetFireTime: customDirective.targetFireTime,
      dependsOnCourse,
      firedAt,
      deliveredAt,
      shouldFireNow,
      recommendationReason,
      urgency,
      suggestedAction
    };
  });

  // Determine active course & next suggested fire
  const activeCourseState = courseStates.find((cs) => cs.status === "in_prep" || cs.status === "ready")
    || courseStates.find((cs) => cs.status === "unfired");
  const nextSuggested = courseStates.find((cs) => cs.status === "unfired" && cs.shouldFireNow);

  // Synthesize concise server messaging
  let serverPacingMessage = "All active courses coordinated.";
  let hasPacingAlert = false;

  const mainsState = courseStates.find((cs) => cs.course === "mains");
  const startersState = courseStates.find((cs) => cs.course === "starters");
  const dessertsState = courseStates.find((cs) => cs.course === "desserts");

  if (nextSuggested) {
    hasPacingAlert = true;
    if (nextSuggested.course === "mains" && startersState?.status === "delivered") {
      serverPacingMessage = `Appetizers delivered · Entrées held · Suggested fire: NOW`;
    } else {
      serverPacingMessage = `${nextSuggested.recommendationReason || `${nextSuggested.course.toUpperCase()} ready to fire`}`;
    }
  } else if (mainsState?.status === "in_prep") {
    serverPacingMessage = `Entrées estimated ready in ~${mainsState.estimatedPrepMinutes} min · Dessert ${dessertsState?.status === "unfired" ? "held" : "coordinated"}`;
  } else if (mainsState?.status === "delivered" && dessertsState?.status === "unfired") {
    hasPacingAlert = true;
    serverPacingMessage = `Entrées finished · Inquire for Dessert & Digestifs`;
  }

  return {
    sessionId: session.id,
    tableLabel: session.tableLabel,
    activeCourse: activeCourseState?.course,
    nextSuggestedFireCourse: nextSuggested?.course,
    courses: courseStates,
    serverPacingMessage,
    hasPacingAlert
  };
}
