import { UAParser } from "ua-parser-js";

const MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS = 1024;

// ua-parser-js ships a bot-detection helper, but it lives at a package
// subpath ("ua-parser-js/bot-detection") that this project's CommonJS
// module resolution setting cannot resolve without changing how every
// other import in the project is compiled. A simple, well-known keyword
// match covers the common analytics/monitoring/social-preview crawlers
// this product actually needs to distinguish from real visitors.
const BOT_USER_AGENT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|bingpreview/i;

export type ParsedDeviceType = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export interface ParsedUserAgent {
  deviceType: ParsedDeviceType;
  browserName: string | null;
  osName: string | null;
}

/**
 * Classifies a raw User-Agent header into the small, stable category set
 * click_events actually stores. A missing, empty, or unparsable value
 * falls back to "unknown" rather than throwing — enrichment failure must
 * never prevent the click from being counted.
 */
export function parseUserAgent(rawUserAgent: string | null): ParsedUserAgent {
  if (rawUserAgent === null || rawUserAgent.trim().length === 0) {
    return { deviceType: "unknown", browserName: null, osName: null };
  }

  const boundedUserAgent = rawUserAgent.slice(0, MAX_USER_AGENT_INPUT_LENGTH_CHARACTERS);

  try {
    const parseResult = new UAParser(boundedUserAgent).getResult();
    const browserName = parseResult.browser.name ?? null;
    const osName = parseResult.os.name ?? null;

    if (BOT_USER_AGENT_PATTERN.test(boundedUserAgent)) {
      return { deviceType: "bot", browserName, osName };
    }

    return { deviceType: mapDeviceType(parseResult.device.type), browserName, osName };
  } catch {
    return { deviceType: "unknown", browserName: null, osName: null };
  }
}

function mapDeviceType(rawDeviceType: string | undefined): ParsedDeviceType {
  // ua-parser-js leaves device.type undefined for an ordinary desktop
  // browser; there is no "desktop" value to detect directly.
  if (rawDeviceType === undefined) {
    return "desktop";
  }

  if (rawDeviceType === "mobile") {
    return "mobile";
  }

  if (rawDeviceType === "tablet") {
    return "tablet";
  }

  // Console, smart TV, wearable, XR, and embedded devices exist but are
  // not part of this product's device_type enum; represent them as
  // unknown rather than adding database enum values nothing displays yet.
  return "unknown";
}
