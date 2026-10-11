import type { MetadataRoute } from "next";

/**
 * Lets a browser add the app to a home screen with its own name and icon, and
 * open it without browser chrome. Nothing here works offline; the app still
 * needs a connection for everything it does.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NoboJatra",
    short_name: "NoboJatra",
    description:
      "Compare car-route options and estimated fares for a trip, and save the plans you want to keep.",
    start_url: "/",
    display: "standalone",
    background_color: "#19140f",
    theme_color: "#19140f",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
