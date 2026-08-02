import Navbar from "@/components/navbar";

// The navbar belongs to the signed-in product surface and the landing page,
// not to the auth flow — see app/(auth)/layout.tsx.
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
