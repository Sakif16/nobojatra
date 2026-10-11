import {
  hasLiveTraffic,
  liveTrafficUnavailableMessage,
  type CountryCode,
} from "@/lib/country-config";
import {
  TRAFFIC_NOT_SET_UP_MESSAGE,
  WEATHER_NOT_SET_UP_MESSAGE,
  type ServerFeatures,
} from "@/lib/env";

/**
 * Why there is no traffic data, in the order that stays true longest: the
 * country has none, this server has no key, or the provider failed just now.
 */
export function describeTrafficUnavailable(country: CountryCode, features: ServerFeatures) {
  if (!hasLiveTraffic(country)) return liveTrafficUnavailableMessage(country);
  if (!features.liveTraffic) return TRAFFIC_NOT_SET_UP_MESSAGE;

  return "Live traffic is unavailable right now.";
}

/** Whether a traffic request is worth making at all. */
export function canRequestTraffic(country: CountryCode, features: ServerFeatures) {
  return hasLiveTraffic(country) && features.liveTraffic;
}

export function describeWeatherUnavailable(features: ServerFeatures) {
  return features.weather ? "Weather data unavailable" : WEATHER_NOT_SET_UP_MESSAGE.replace(/\.$/, "");
}
