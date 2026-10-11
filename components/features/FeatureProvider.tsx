"use client";

import { createContext, useContext } from "react";
import { ALL_FEATURES_ON, type ServerFeatures } from "@/lib/env";

/**
 * Which optional features this server has keys for, available to any client
 * component under (main).
 *
 * Decided on the server in app/(main)/layout.tsx from the environment, so a
 * screen can say "not set up" instead of offering a control that cannot work.
 * Only on/off flags cross to the browser, never a key.
 */
const FeatureContext = createContext<ServerFeatures>(ALL_FEATURES_ON);

export function FeatureProvider({
  features,
  children,
}: {
  features: ServerFeatures;
  children: React.ReactNode;
}) {
  return <FeatureContext.Provider value={features}>{children}</FeatureContext.Provider>;
}

/** Falls back to everything on outside a provider, where nothing is known. */
export function useServerFeatures(): ServerFeatures {
  return useContext(FeatureContext);
}
