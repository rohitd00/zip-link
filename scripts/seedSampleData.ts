// Populates a local database with a handful of obviously-fake sample links
// and click events, so a new developer (or this project's own manual QA)
// can see the dashboard and analytics pages with real-looking data instead
// of an empty state. Every value here is explicitly non-sensitive: made-up
// destination URLs, a fixed demo owner ID, and synthetic click events with
// no real visitor behind them.
//
// Usage: npm run seed
// Safe to run more than once — it deletes its own previously seeded rows
// (matched by the fixed demo owner ID below) before inserting fresh ones,
// rather than accumulating duplicates on every run.

import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// A fixed, recognizable owner ID (not a real anonymous-session cookie
// value) so this script's own rows are easy to find and safely re-seed.
const SEED_OWNER_ID = "00000000-0000-0000-0000-000000000seed";

interface SeedLinkDefinition {
  shortCode: string;
  longUrl: string;
}

const SEED_LINKS: SeedLinkDefinition[] = [
  { shortCode: "demo-docs", longUrl: "https://example.com/docs/getting-started" },
  { shortCode: "demo-blog", longUrl: "https://example.com/blog/how-we-built-this" },
  { shortCode: "demo-signup", longUrl: "https://example.com/signup" },
];

interface SeedClickEventDefinition {
  daysAgo: number;
  referrerHost: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  browserName: string | null;
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
}

// A small, varied spread of sample events per link, so referrer/device/
// browser/geography breakdown cards all have something to show instead of
// every card being a single dominant row. Every offset stays within the
// last few days on purpose: click_events is a partitioned table (see
// database-schema.md Section 8.3), and only the current and next few
// months have a partition created for them (see
// scripts/create-future-click-event-partitions.ts) — a past-month
// timestamp would fail to insert with "no partition of relation found".
const SEED_CLICK_EVENTS: SeedClickEventDefinition[] = [
  {
    daysAgo: 0,
    referrerHost: "news.example.com",
    deviceType: "desktop",
    browserName: "Chrome",
    countryCode: "US",
    countryName: "United States",
    cityName: "Austin",
  },
  {
    daysAgo: 0,
    referrerHost: null,
    deviceType: "mobile",
    browserName: "Safari",
    countryCode: "GB",
    countryName: "United Kingdom",
    cityName: "London",
  },
  {
    daysAgo: 1,
    referrerHost: "search.example.com",
    deviceType: "desktop",
    browserName: "Firefox",
    countryCode: "DE",
    countryName: "Germany",
    cityName: "Berlin",
  },
  {
    daysAgo: 1,
    referrerHost: "social.example.com",
    deviceType: "tablet",
    browserName: "Chrome",
    countryCode: "IN",
    countryName: "India",
    cityName: "Bengaluru",
  },
  {
    daysAgo: 2,
    referrerHost: null,
    deviceType: "mobile",
    browserName: "Chrome",
    countryCode: "US",
    countryName: "United States",
    cityName: "Austin",
  },
];

async function deletePreviousSeedData(pool: Pool): Promise<void> {
  const existingSeedLinks = await pool.query<{ id: string }>(
    `SELECT id FROM links WHERE owner_id = $1;`,
    [SEED_OWNER_ID],
  );
  const seedLinkIds = existingSeedLinks.rows.map((row) => row.id);

  if (seedLinkIds.length === 0) {
    return;
  }

  await pool.query(`DELETE FROM click_events WHERE link_id = ANY($1::bigint[]);`, [seedLinkIds]);
  await pool.query(`DELETE FROM links WHERE id = ANY($1::bigint[]);`, [seedLinkIds]);
  console.log(`Removed ${seedLinkIds.length} previously seeded link(s) before re-seeding.`);
}

async function insertSeedLink(pool: Pool, definition: SeedLinkDefinition): Promise<string> {
  const insertResult = await pool.query<{ id: string }>(
    `
      INSERT INTO links (short_code, long_url, normalized_long_url, owner_type, owner_id, is_custom_alias)
      VALUES ($1, $2, $3, 'anonymous_session', $4, true)
      RETURNING id;
    `,
    [definition.shortCode, definition.longUrl, definition.longUrl, SEED_OWNER_ID],
  );

  const linkId = insertResult.rows[0]?.id;

  if (linkId === undefined) {
    throw new Error(`Failed to insert seed link for short code "${definition.shortCode}".`);
  }

  return linkId;
}

/**
 * click_events only has a partition for the current UTC month and a few
 * months ahead (see scripts/create-future-click-event-partitions.ts), not
 * for past months. A naive "N days ago" timestamp would fail to insert
 * whenever this script runs near the start of a month and subtracting
 * days crosses back into the previous, unpartitioned month. Clamping to
 * the start of the current month keeps every seeded event valid no matter
 * which day of the month this script is run.
 */
function clampToCurrentUtcMonth(candidate: Date): Date {
  const now = new Date();
  const startOfCurrentUtcMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return candidate < startOfCurrentUtcMonth ? startOfCurrentUtcMonth : candidate;
}

async function insertSeedClickEvents(pool: Pool, linkId: string, shortCode: string): Promise<void> {
  for (const eventDefinition of SEED_CLICK_EVENTS) {
    const occurredAt = clampToCurrentUtcMonth(
      new Date(Date.now() - eventDefinition.daysAgo * 24 * 60 * 60 * 1000),
    );

    await pool.query(
      `
        INSERT INTO click_events (
          occurred_at, event_id, link_id, short_code, referrer_host,
          device_type, browser_name, country_code, country_name, city_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
      `,
      [
        occurredAt,
        crypto.randomUUID(),
        linkId,
        shortCode,
        eventDefinition.referrerHost,
        eventDefinition.deviceType,
        eventDefinition.browserName,
        eventDefinition.countryCode,
        eventDefinition.countryName,
        eventDefinition.cityName,
      ],
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is not set. Add it to the repository .env file.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await deletePreviousSeedData(pool);

    for (const linkDefinition of SEED_LINKS) {
      const linkId = await insertSeedLink(pool, linkDefinition);
      await insertSeedClickEvents(pool, linkId, linkDefinition.shortCode);
      console.log(
        `Seeded link "${linkDefinition.shortCode}" with ${SEED_CLICK_EVENTS.length} click events.`,
      );
    }

    console.log("Seeding complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to seed sample data.", error);
  process.exitCode = 1;
});
