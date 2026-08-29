import type { RestaurantConfig } from "@/lib/domain/restaurant/config";

export const sicPizzaConfig: RestaurantConfig = {
  id: "sic-pizza",
  name: "SIC PIZZA",
  tagline: "Bad decisions, hot",
  currency: "USD",
  taxRatePercent: 8.25,
  stations: [
    { id: "pizza-oven", name: "Pizza Oven", description: "Deck & Woodfired Ovens", color: "#e11d48" },
    { id: "bar", name: "Bar", description: "Beer, Wine & Cocktails", color: "#3b82f6" },
    { id: "cold-prep", name: "Salad / Cold Prep", description: "Appetizers and Salads", color: "#10b981" },
    { id: "expo", name: "Expo & Delivery", description: "Consolidation & Runner Dispatch", color: "#f59e0b" }
  ],
  courses: [
    { id: "drinks", label: "Drinks", sortOrder: 1, targetPacingMinutes: 3 },
    { id: "starters", label: "Starters & Salads", sortOrder: 2, targetPacingMinutes: 8 },
    { id: "mains", label: "Pizzas & Mains", sortOrder: 3, targetPacingMinutes: 15 },
    { id: "desserts", label: "Desserts", sortOrder: 4, targetPacingMinutes: 10 }
  ],
  features: {
    enableGuestOrdering: true,
    requireServerApprovalForGuests: true,
    enableTableAssistanceRequests: true,
    enableEqualSplit: true,
    enableItemizedSplit: true
  }
};
