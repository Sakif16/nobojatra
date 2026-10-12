/**
 * What the app needs from its environment, and what each missing piece costs.
 *
 * One list, read in three places: the startup check in instrumentation.ts, the
 * feature switches the screens use to say a feature is off, and the tests that
 * keep .env.example and the README in step with it.
 *
 * No imports and no Node APIs: instrumentation.ts is bundled for the Edge
 * runtime too.
 */

type Env = Record<string, string | undefined>;

type RequiredVariable = {
  name: string;
  /** What breaks without it. */
  effect: string;
  /** Returns a complaint when the value is set but cannot work. */
  validate?: (value: string) => string | null;
};

type OptionalVariable = {
  name: string;
  /** The feature that is off without it. */
  effect: string;
};

function isUrl(value: string, protocols: string[]) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const REQUIRED_VARIABLES: RequiredVariable[] = [
  {
    name: "MONGODB_URI",
    effect: "the app cannot reach its database",
    validate: (value) =>
      /^mongodb(\+srv)?:\/\//.test(value)
        ? null
        : "must start with mongodb:// or mongodb+srv://",
  },
  {
    name: "BETTER_AUTH_SECRET",
    effect: "sign-in does not work",
    validate: (value) => value.length >= 32 ? null : "must contain at least 32 characters (generate with openssl rand -base64 32)",
  },
  {
    name: "BETTER_AUTH_URL",
    effect: "sign-in and password reset links point at the wrong place",
    validate: (value) =>
      isUrl(value, ["http:", "https:"]) ? null : "must be a full URL such as http://localhost:3000",
  },
  {
    name: "ORS_API_KEY",
    effect: "route search fails, and nothing else can be planned without a route",
  },
];

export const OPTIONAL_VARIABLES: OptionalVariable[] = [
  {
    name: "TOMTOM_API_KEY",
    effect: "live traffic and the map's traffic overlay are off; times and fares use no traffic data",
  },
  {
    name: "OPENWEATHER_API_KEY",
    effect: "weather is off; fares carry no weather adjustment and no vehicle is held back for weather",
  },
  {
    name: "PATHAO_FARE_API",
    effect: "live Pathao pricing is off; Pathao fares come from the rate card",
  },
  {
    name: "RESEND_API_KEY",
    effect: "password reset emails cannot be sent; the reset page says so",
  },
  {
    name: "NEXT_PUBLIC_TM_MODEL_URL",
    effect: "photo search is disabled; places can still be searched by name",
  },
];

/**
 * Whether a variable holds a usable value.
 *
 * A value still carrying the `your_…` wording of .env.example counts as unset:
 * a copied, unedited example file would otherwise switch every feature on with
 * a key that cannot work.
 */
export function isConfigured(value: string | undefined): boolean {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();

  return trimmed.length > 0 && !/your_/i.test(trimmed);
}

export type EnvironmentReport = {
  /** Required variables that are unset or unusable. Startup stops on any. */
  problems: string[];
  /** Optional variables that are unset, with the feature each switches off. */
  unavailable: string[];
  /** Settings that work but should be looked at. */
  warnings: string[];
};

export function checkEnvironment(env: Env): EnvironmentReport {
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const variable of REQUIRED_VARIABLES) {
    const value = env[variable.name]?.trim() ?? "";

    if (!isConfigured(value)) {
      const placeholder = value.length > 0;
      problems.push(
        `${variable.name} ${placeholder ? "still holds the .env.example placeholder" : "is not set"}: ${variable.effect}.`,
      );
      continue;
    }

    const complaint = variable.validate?.(value);
    if (complaint) problems.push(`${variable.name} ${complaint}.`);
  }

  const unavailable = OPTIONAL_VARIABLES.filter(
    (variable) => !isConfigured(env[variable.name]),
  ).map((variable) => `${variable.name} is not set: ${variable.effect}.`);

  const trustedHeader = env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader && !["x-forwarded-for", "x-real-ip", "cf-connecting-ip"].includes(trustedHeader)) {
    problems.push("AUTH_TRUSTED_IP_HEADER must name a supported, host-verified header.");
  } else if (!trustedHeader) {
    warnings.push("No IP header is trusted: auth limits use shared per-path buckets until the demo host's proxy behavior is verified.");
  }

  if (isConfigured(env.RESEND_API_KEY) && !isConfigured(env.RESEND_FROM_EMAIL)) {
    warnings.push(
      "RESEND_FROM_EMAIL is not set: reset emails go out from Resend's testing sender, which delivers only to the Resend account owner.",
    );
  }

  if (isConfigured(env.NEXT_PUBLIC_MAPBOX_TOKEN)) {
    warnings.push(
      "NEXT_PUBLIC_MAPBOX_TOKEN is set: Mapbox is not used, and setting it switches the map to layers that are not configured. Unset it.",
    );
  }

  return { problems, unavailable, warnings };
}

/** The startup log, or null when there is nothing to say. */
export function formatEnvironmentReport(report: EnvironmentReport): string | null {
  const sections: string[] = [];

  if (report.problems.length > 0) {
    sections.push(
      ["Required settings are missing:", ...report.problems.map((line) => `  - ${line}`)].join("\n"),
    );
  }

  if (report.unavailable.length > 0) {
    sections.push(
      ["Optional features that are off:", ...report.unavailable.map((line) => `  - ${line}`)].join("\n"),
    );
  }

  if (report.warnings.length > 0) {
    sections.push(["Worth checking:", ...report.warnings.map((line) => `  - ${line}`)].join("\n"));
  }

  return sections.length > 0
    ? `[NoboJatra] Environment check (see .env.example)\n${sections.join("\n")}`
    : null;
}

/**
 * The optional features this server can offer, decided by which keys are set.
 * Handed to the screens so a feature that is off says so, instead of loading
 * forever or failing on first use.
 */
export type ServerFeatures = {
  liveTraffic: boolean;
  weather: boolean;
  passwordResetEmail: boolean;
};

export const ALL_FEATURES_ON: ServerFeatures = {
  liveTraffic: true,
  weather: true,
  passwordResetEmail: true,
};

export function getServerFeatures(env: Env): ServerFeatures {
  return {
    liveTraffic: isConfigured(env.TOMTOM_API_KEY),
    weather: isConfigured(env.OPENWEATHER_API_KEY),
    passwordResetEmail: isConfigured(env.RESEND_API_KEY),
  };
}

export const TRAFFIC_NOT_SET_UP_MESSAGE = "Live traffic is not set up on this server.";
export const WEATHER_NOT_SET_UP_MESSAGE = "Weather is not set up on this server.";
