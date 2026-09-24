const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

// Nominatim's usage policy requires a User-Agent that names the app and gives
// its operators a way to reach us. The repository URL does both without
// publishing an email address; set NOMINATIM_USER_AGENT to add one privately.
const DEFAULT_NOMINATIM_USER_AGENT =
  "NoboJatra/1.0 (+https://github.com/Sakif16/nobojatra)";

export function getNominatimConfig() {
  return {
    baseUrl: process.env.NOMINATIM_BASE_URL ?? DEFAULT_NOMINATIM_BASE_URL,
    userAgent: process.env.NOMINATIM_USER_AGENT ?? DEFAULT_NOMINATIM_USER_AGENT,
  };
}
