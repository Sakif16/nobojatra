import type { MetadataRoute } from "next";

/**
 * The app is members-only: every page but the sign-in ones redirects a visitor
 * to sign in, and holds nothing a search engine could usefully index. So
 * crawlers are pointed at the two public pages and asked to leave the rest,
 * including the API, alone.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/signin", "/signup"],
      disallow: "/",
    },
  };
}
