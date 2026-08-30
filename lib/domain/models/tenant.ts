import type { ModifierGroupDefinition, MenuItemWithModifiers } from "./modifiers";
import { DEFAULT_ATTENTION_CONFIG, type AttentionConfig } from "./attention";

export interface TenantStation {
  id: string;
  name: string;
  targetMinutes: number;
  description?: string;
}

export interface TenantTable {
  tableId: string;
  tableLabel: string;
  diningAreaName: string;
  seats: number;
}

export interface TenantEmployee {
  id: string;
  name: string;
  role: "server" | "manager" | "cook" | "runner" | "bartender";
  pin: string;
}

export interface TenantTheme {
  brandName: string;
  logoShort: string;
  tagline: string;
  badgeClass: string;
}

export interface RestaurantTenant {
  tenantId: string;
  organizationId: string;
  locationId: string;
  name: string;
  cuisine: string;
  theme: TenantTheme;
  taxRatePercent: number;
  stations: TenantStation[];
  menuCategories: Array<{ id: string; name: string }>;
  menuItems: MenuItemWithModifiers[];
  modifierGroups: ModifierGroupDefinition[];
  tables: TenantTable[];
  employees: TenantEmployee[];
  attentionConfig: AttentionConfig;
}

/**
 * -----------------------------------------------------------------------------
 * TENANT 1: SIC PIZZA (Flagship Demo Pizzeria)
 * -----------------------------------------------------------------------------
 */
const SIC_PIZZA_MODIFIERS: ModifierGroupDefinition[] = [
  {
    id: "grp_crust",
    name: "Crust Style",
    minSelections: 1,
    maxSelections: 1,
    required: true,
    allowPlacement: false,
    options: [
      { id: "crust_sourdough", name: "Artisan Sourdough (Standard)", priceCents: 0, isAvailable: true },
      { id: "crust_thin_crispy", name: "Roman Thin & Crispy", priceCents: 0, isAvailable: true },
      { id: "crust_gluten_free", name: "Gluten-Friendly Cauliflower", priceCents: 350, isAvailable: true, requiresAllergenAck: true, allergens: ["gluten_free_facility_warning"] },
      { id: "crust_stuffed_garlic", name: "Stuffed Garlic Butter Crust", priceCents: 450, isAvailable: true, allowedSizes: ["large"], allergens: ["dairy"] }
    ]
  },
  {
    id: "grp_sauce",
    name: "Sauce Base",
    minSelections: 1,
    maxSelections: 1,
    required: true,
    allowPlacement: true,
    options: [
      { id: "sauce_san_marzano", name: "San Marzano Tomato", priceCents: 0, isAvailable: true },
      { id: "sauce_bianca_garlic", name: "Bianca Garlic Cream", priceCents: 0, isAvailable: true, allergens: ["dairy"] },
      { id: "sauce_spicy_vodka", name: "Calabrian Spicy Vodka Sauce", priceCents: 150, isAvailable: true, allergens: ["dairy"] }
    ]
  },
  {
    id: "grp_toppings",
    name: "Meat & Vegetable Toppings",
    minSelections: 0,
    maxSelections: 10,
    required: false,
    allowPlacement: true,
    options: [
      { id: "top_cupping_pep", name: "Crispy Cupping Pepperoni", priceCents: 250, isAvailable: true, allowPlacement: true, allowLevels: true, extraPriceCents: 150 },
      { id: "top_fennel_sausage", name: "Sweet Italian Fennel Sausage", priceCents: 250, isAvailable: true, allowPlacement: true, allowLevels: true, extraPriceCents: 150 },
      { id: "top_roasted_mushrooms", name: "Wild Forest Mushrooms", priceCents: 200, isAvailable: true, allowPlacement: true, allowLevels: true, extraPriceCents: 125 },
      { id: "top_hot_honey", name: "Mike's Hot Honey Drizzle", priceCents: 150, isAvailable: true, allowPlacement: true, allowLevels: true },
      { id: "top_basil", name: "Fresh Genovese Basil", priceCents: 100, isAvailable: false, allowPlacement: true, allowLevels: true } // 86'd
    ]
  }
];

const SIC_PIZZA_ITEMS: MenuItemWithModifiers[] = [
  {
    id: "pizza_margherita",
    name: "Wood-Fired Margherita D.O.P.",
    basePriceCents: 1900,
    course: "mains",
    stationId: "PIZZA",
    size: "large",
    modifierGroups: SIC_PIZZA_MODIFIERS
  },
  {
    id: "pizza_pep",
    name: "Hot Honey Pepperoni Pizza",
    basePriceCents: 2200,
    course: "mains",
    stationId: "PIZZA",
    size: "large",
    modifierGroups: SIC_PIZZA_MODIFIERS
  },
  {
    id: "starter_knots",
    name: "Garlic Butter Knots (6pc)",
    basePriceCents: 850,
    course: "starters",
    stationId: "FRY",
    modifierGroups: []
  },
  {
    id: "salad_caesar",
    name: "Charred Romaine Caesar",
    basePriceCents: 1300,
    course: "starters",
    stationId: "SALAD",
    modifierGroups: []
  },
  {
    id: "drink_margarita",
    name: "Blood Orange Mezcalita",
    basePriceCents: 1500,
    course: "drinks",
    stationId: "BAR",
    modifierGroups: []
  },
  {
    id: "dessert_cannoli",
    name: "Pistachio Ricotta Cannoli (3pc)",
    basePriceCents: 950,
    course: "desserts",
    stationId: "DESSERT",
    modifierGroups: []
  }
];

export const SIC_PIZZA_TENANT: RestaurantTenant = {
  tenantId: "sic_pizza_tenant",
  organizationId: "org_sic_hospitality",
  locationId: "loc_downtown",
  name: "SIC Pizza Co.",
  cuisine: "Artisan Wood-Fired Pizza & Italian Starters",
  theme: {
    brandName: "SIC PIZZA",
    logoShort: "SIC",
    tagline: "Serious Sourdough Crust & Craft Cocktails",
    badgeClass: "bg-primary text-primary-foreground"
  },
  taxRatePercent: 8.25,
  stations: [
    { id: "PIZZA", name: "Pizza Station (Wood Oven)", targetMinutes: 18, description: "Deck oven baking & pie assembly" },
    { id: "GRILL", name: "Grill Station", targetMinutes: 14, description: "Hot proteins & roasted vegetables" },
    { id: "FRY", name: "Fry Station", targetMinutes: 10, description: "Garlic knots, calamari & fries" },
    { id: "SALAD", name: "Salad & Pantry", targetMinutes: 8, description: "Cold appetizers, caprese & greens" },
    { id: "BAR", name: "Cocktail Bar", targetMinutes: 5, description: "Draft beer, wine & cocktails" },
    { id: "DESSERT", name: "Dessert Station", targetMinutes: 6, description: "Cannoli, gelato & affogato" },
    { id: "EXPO", name: "Expo Line Master", targetMinutes: 2, description: "Final quality check & tray consolidation" }
  ],
  menuCategories: [
    { id: "starters", name: "Starters & Small Plates" },
    { id: "pizzas", name: "Wood-Fired Pizzas" },
    { id: "salads", name: "Salads & Greens" },
    { id: "drinks", name: "Cocktails & Beverages" },
    { id: "desserts", name: "Desserts" }
  ],
  menuItems: SIC_PIZZA_ITEMS,
  modifierGroups: SIC_PIZZA_MODIFIERS,
  tables: [
    { tableId: "tbl_11", tableLabel: "Table 11", diningAreaName: "Main Dining", seats: 4 },
    { tableId: "tbl_12", tableLabel: "Table 12", diningAreaName: "Main Dining", seats: 2 },
    { tableId: "tbl_14", tableLabel: "Table 14", diningAreaName: "Main Dining", seats: 4 },
    { tableId: "tbl_21", tableLabel: "Table 21", diningAreaName: "Patio", seats: 6 },
    { tableId: "tbl_22", tableLabel: "Table 22", diningAreaName: "Patio", seats: 4 },
    { tableId: "tbl_bar1", tableLabel: "Bar 01", diningAreaName: "Bar Area", seats: 2 },
    { tableId: "tbl_bar2", tableLabel: "Bar 02", diningAreaName: "Bar Area", seats: 2 }
  ],
  employees: [
    { id: "emp_jordan", name: "Jordan", role: "server", pin: "1234" },
    { id: "emp_taylor", name: "Taylor", role: "server", pin: "5678" },
    { id: "emp_morgan", name: "Morgan", role: "server", pin: "4321" },
    { id: "emp_sam_mgr", name: "Sam (Manager)", role: "manager", pin: "9999" }
  ],
  attentionConfig: DEFAULT_ATTENTION_CONFIG
};

/**
 * -----------------------------------------------------------------------------
 * TENANT 2: SAKURA IZAKAYA (Japanese Gastropub Demonstration Tenant)
 * Proves platform versatility with completely distinct stations, courses, and modifiers.
 * -----------------------------------------------------------------------------
 */
const SAKURA_MODIFIERS: ModifierGroupDefinition[] = [
  {
    id: "grp_skewer_glaze",
    name: "Skewer Seasoning",
    minSelections: 1,
    maxSelections: 1,
    required: true,
    allowPlacement: false,
    options: [
      { id: "opt_tare", name: "Tare Sweet Soy Glaze", priceCents: 0, isAvailable: true },
      { id: "opt_shio", name: "Shio (Sea Salt & Lemon)", priceCents: 0, isAvailable: true },
      { id: "opt_spicy_miso", name: "Spicy Miso Paste", priceCents: 100, isAvailable: true }
    ]
  },
  {
    id: "grp_spice_level",
    name: "Wasabi & Spice Level",
    minSelections: 0,
    maxSelections: 1,
    required: false,
    allowPlacement: false,
    options: [
      { id: "opt_fresh_wasabi", name: "Real Shizuoka Wasabi", priceCents: 200, isAvailable: true },
      { id: "opt_no_wasabi", name: "No Wasabi (Sabi-nuki)", priceCents: 0, isAvailable: true }
    ]
  }
];

const SAKURA_ITEMS: MenuItemWithModifiers[] = [
  {
    id: "skewer_tsukune",
    name: "Chicken Tsukune Skewer",
    basePriceCents: 900,
    course: "mains",
    stationId: "YAKITORI_GRILL",
    modifierGroups: [SAKURA_MODIFIERS[0]]
  },
  {
    id: "raw_salmon_crudo",
    name: "King Salmon Truffle Crudo",
    basePriceCents: 1800,
    course: "starters",
    stationId: "SUSHI_BAR",
    modifierGroups: [SAKURA_MODIFIERS[1]]
  },
  {
    id: "hot_karaage",
    name: "Tokyo Garlic Karaage",
    basePriceCents: 1200,
    course: "starters",
    stationId: "HOT_KITCHEN",
    modifierGroups: []
  },
  {
    id: "drink_highball",
    name: "Suntory Toki Highball",
    basePriceCents: 1400,
    course: "drinks",
    stationId: "SAKE_BAR",
    modifierGroups: []
  }
];

export const SAKURA_IZAKAYA_TENANT: RestaurantTenant = {
  tenantId: "sakura_izakaya_tenant",
  organizationId: "org_sakura_group",
  locationId: "loc_uptown",
  name: "Sakura Izakaya & Robata",
  cuisine: "Japanese Small Plates, Yakitori & Sake",
  theme: {
    brandName: "SAKURA IZAKAYA",
    logoShort: "SAKURA",
    tagline: "Charcoal Robata, Sashimi & Japanese Craft Beer",
    badgeClass: "bg-rose-600 text-white"
  },
  taxRatePercent: 8.875,
  stations: [
    { id: "SUSHI_BAR", name: "Sushi & Raw Bar", targetMinutes: 10, description: "Sashimi, Nigiri & hand rolls" },
    { id: "YAKITORI_GRILL", name: "Robata Charcoal Grill", targetMinutes: 15, description: "Yakitori skewers & grilled wagyu" },
    { id: "HOT_KITCHEN", name: "Hot Kitchen & Wok", targetMinutes: 12, description: "Gyoza, Karaage & Tempura" },
    { id: "SAKE_BAR", name: "Sake & Cocktail Bar", targetMinutes: 4, description: "Junmai Daiginjo, Highballs & Teas" },
    { id: "EXPO", name: "Expo Line Master", targetMinutes: 2, description: "Plating & tray runner dispatch" }
  ],
  menuCategories: [
    { id: "skewers", name: "Robata Skewers" },
    { id: "raw", name: "Sashimi & Crudo" },
    { id: "hot", name: "Hot Izakaya Dishes" },
    { id: "sake", name: "Sake & Highballs" }
  ],
  modifierGroups: SAKURA_MODIFIERS,
  menuItems: SAKURA_ITEMS,
  tables: [
    { tableId: "tbl_sakura_1", tableLabel: "Tatami 01", diningAreaName: "Tatami Room", seats: 6 },
    { tableId: "tbl_sakura_2", tableLabel: "Tatami 02", diningAreaName: "Tatami Room", seats: 4 },
    { tableId: "tbl_sakura_counter1", tableLabel: "Robata Counter 01", diningAreaName: "Counter", seats: 2 },
    { tableId: "tbl_sakura_counter2", tableLabel: "Robata Counter 02", diningAreaName: "Counter", seats: 2 }
  ],
  employees: [
    { id: "emp_kenji", name: "Kenji", role: "server", pin: "1111" },
    { id: "emp_yuki", name: "Yuki", role: "server", pin: "2222" },
    { id: "emp_hana_mgr", name: "Hana (Manager)", role: "manager", pin: "9999" }
  ],
  attentionConfig: DEFAULT_ATTENTION_CONFIG
};

export const AVAILABLE_TENANTS: RestaurantTenant[] = [
  SIC_PIZZA_TENANT,
  SAKURA_IZAKAYA_TENANT
];
