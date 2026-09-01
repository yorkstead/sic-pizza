import { Pool } from "pg";
import { ensureUuid } from "../lib/domain/utils/id-utils";

/**
 * Repeatable synthetic seed script for disposable local and CI test environments.
 * Guarded against execution in production environments.
 */
export async function seedTestDatabase(connectionString?: string): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Safety check: Cannot run synthetic test seeds in production environment.");
  }

  const connStr = connectionString || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("No DATABASE_URL or TEST_DATABASE_URL provided for synthetic seed.");
  }

  const pool = new Pool({ connectionString: connStr });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Organization & Location
    const orgId = ensureUuid("sic_pizza_org");
    const locId = ensureUuid("loc_downtown");

    await client.query(
      `INSERT INTO organizations (id, name, currency)
       VALUES ($1, 'SIC Pizza Artisans', 'USD')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [orgId]
    );

    await client.query(
      `INSERT INTO locations (id, organization_id, name, timezone, tax_rate_percent)
       VALUES ($1, $2, 'Downtown Flagship', 'America/Chicago', 825)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [locId, orgId]
    );

    // 2. Dining Areas
    const areaMain = ensureUuid("area_main");
    const areaPatio = ensureUuid("area_patio");

    await client.query(
      `INSERT INTO dining_areas (id, location_id, name, code, sort_order)
       VALUES 
         ($1, $2, 'Main Dining Room', 'MAIN', 1),
         ($3, $2, 'Covered Patio', 'PATIO', 2)
       ON CONFLICT (id) DO NOTHING`,
      [areaMain, locId, areaPatio]
    );

    // 3. Employees
    const empJordan = ensureUuid("emp_jordan");
    const empManager = ensureUuid("emp_manager");
    const empKitchen = ensureUuid("emp_kitchen");

    await client.query(
      `INSERT INTO employees (id, location_id, display_name, pin_hash, role)
       VALUES 
         ($1, $2, 'Jordan Server', 'demo_pin_hash_0420', 'server'),
         ($3, $2, 'Alex Manager', 'demo_pin_hash_manager', 'manager'),
         ($4, $2, 'Mario Pizza Line', 'demo_pin_hash_kitchen', 'kitchen')
       ON CONFLICT (id) DO NOTHING`,
      [empJordan, locId, empManager, empKitchen]
    );

    // 4. Tables
    const tables = [
      { id: "tbl_11", label: "Table 11", area: areaMain, seats: 4 },
      { id: "tbl_12", label: "Table 12", area: areaMain, seats: 2 },
      { id: "tbl_14", label: "Table 14", area: areaPatio, seats: 6 },
      { id: "tbl_20", label: "Table 20", area: areaMain, seats: 4 },
      { id: "tbl_21", label: "Table 21", area: areaPatio, seats: 2 },
      { id: "tbl_22", label: "Table 22", area: areaMain, seats: 8 }
    ];

    for (const t of tables) {
      await client.query(
        `INSERT INTO tables (id, location_id, dining_area_id, label, seats, status)
         VALUES ($1, $2, $3, $4, $5, 'available')
         ON CONFLICT (id) DO NOTHING`,
        [ensureUuid(t.id), locId, t.area, t.label, t.seats]
      );
    }

    // 5. Kitchen Stations
    const stationPizza = ensureUuid("station_pizza");
    const stationBar = ensureUuid("station_bar");

    await client.query(
      `INSERT INTO kitchen_stations (id, location_id, name, code, color)
       VALUES 
         ($1, $2, 'Wood Fired Oven', 'PIZZA', '#e11d48'),
         ($3, $2, 'Main Craft Bar', 'BAR', '#2563eb')
       ON CONFLICT (id) DO NOTHING`,
      [stationPizza, locId, stationBar]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  seedTestDatabase()
    .then(() => {
      console.log("Synthetic test database successfully seeded.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Synthetic seed failed:", err);
      process.exit(1);
    });
}
