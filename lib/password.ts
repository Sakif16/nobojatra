/**
 * Client-side mirror of the password rule enforced in lib/auth.ts, where the
 * Better Auth `before` middleware rejects anything without a digit and the
 * adapter enforces the minimum length. Keeping the list here means the signup,
 * reset, and any future password form all describe the same rule.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be at least 8 characters and include at least one number.";

export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "number",
    label: "Contains at least one number",
    test: (password) => /\d/.test(password),
  },
];

export function isPasswordValid(password: string) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}
