import Footer from "@/components/Footer";
import Navbar from "@/components/navbar";
import { CountryProvider } from "@/components/country/CountryProvider";
import { FeatureProvider } from "@/components/features/FeatureProvider";
import { DEFAULT_COUNTRY } from "@/lib/country-config";
import { getServerFeatures } from "@/lib/env";
import { getRequestCountry, getRequestSession } from "@/lib/request-context";

// The navbar and footer belong to the product surface, not to the auth flow —
// see app/(auth)/layout.tsx, which is full-bleed and carries its own footer
// line.
//
// The country is resolved once here and shared through CountryProvider, so the
// planner, the place autocomplete and the fare panel all read the same value
// without each fetching it. The session and profile behind it are the same
// reads the navbar and the page use (see lib/request-context.ts). A signed-out
// visitor has no profile and gets the default until the page redirects them.
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequestSession();
  const country = session ? await getRequestCountry(session.user.id) : DEFAULT_COUNTRY;

  return (
    <CountryProvider country={country}>
      {/* Which optional features have keys on this server, so a screen can say
          one is not set up instead of offering a control that cannot work. */}
      <FeatureProvider features={getServerFeatures(process.env)}>
        <Navbar />
        {children}
        <Footer />
      </FeatureProvider>
    </CountryProvider>
  );
}
