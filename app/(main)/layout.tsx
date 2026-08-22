import { headers } from "next/headers";
import Footer from "@/components/Footer";
import Navbar from "@/components/navbar";
import { CountryProvider } from "@/components/country/CountryProvider";
import { auth } from "@/lib/auth";
import { DEFAULT_COUNTRY } from "@/lib/country-config";
import { getUserCountry } from "@/lib/user-country";

// The navbar and footer belong to the product surface, not to the auth flow —
// see app/(auth)/layout.tsx, which is full-bleed and carries its own footer
// line.
//
// The country is resolved once here and shared through CountryProvider, so the
// planner, the place autocomplete and the fare panel all read the same value
// without each fetching it. Visitors have no profile — the landing page renders
// under this layout too — so they get the default.
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const country = session ? await getUserCountry(session.user.id) : DEFAULT_COUNTRY;

  return (
    <CountryProvider country={country}>
      <Navbar />
      {children}
      <Footer />
    </CountryProvider>
  );
}
