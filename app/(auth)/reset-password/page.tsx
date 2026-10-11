import type { Metadata } from "next";
import ResetPasswordForm from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const { error, token } = await searchParams;

  return <ResetPasswordForm token={token} tokenError={error} />;
}
