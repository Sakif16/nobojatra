"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

type TravelPriority = "time" | "cost" | "comfort";

type ProfileFormProps = {
  initialUser: {
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  };
  initialProfile: {
    defaultTravelPriority: TravelPriority;
    defaultPassengerCount: number;
  };
};

const travelPriorities: Array<{ label: string; value: TravelPriority }> = [
  { label: "Time", value: "time" },
  { label: "Cost", value: "cost" },
  { label: "Comfort", value: "comfort" },
];

export default function ProfileForm({ initialUser, initialProfile }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [defaultTravelPriority, setDefaultTravelPriority] = useState<TravelPriority>(
    initialProfile.defaultTravelPriority,
  );
  const [defaultPassengerCount, setDefaultPassengerCount] = useState(
    initialProfile.defaultPassengerCount,
  );
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const createdAt = useMemo(() => {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(initialUser.createdAt));
  }, [initialUser.createdAt]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    setIsSaving(true);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        defaultTravelPriority,
        defaultPassengerCount,
      }),
    });
    const result = (await response.json()) as { message?: string };

    setIsSaving(false);

    if (!response.ok) {
      setErrorMessage(result.message || "Unable to save profile.");
      return;
    }

    setMessage(result.message || "Profile saved.");
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    setMessage("");
    setErrorMessage("");
    setIsDeleting(true);

    const response = await fetch("/api/profile", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmation: deleteConfirmation,
      }),
    });
    const result = (await response.json()) as { message?: string };

    setIsDeleting(false);

    if (!response.ok) {
      setErrorMessage(result.message || "Unable to delete account.");
      return;
    }

    window.location.replace("/signin");
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your account and travel defaults.</p>
      </div>

      <form onSubmit={handleSave} className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Display Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Status: {initialUser.emailVerified ? "Verified" : "Not verified"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-medium">Default Travel Priority</span>
            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-input">
              {travelPriorities.map((priority) => (
                <label
                  key={priority.value}
                  className="flex h-10 cursor-pointer items-center justify-center border-r border-input text-sm last:border-r-0 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                >
                  <input
                    type="radio"
                    name="defaultTravelPriority"
                    value={priority.value}
                    checked={defaultTravelPriority === priority.value}
                    onChange={() => setDefaultTravelPriority(priority.value)}
                    className="sr-only"
                  />
                  {priority.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="passengers" className="mb-2 block text-sm font-medium">
              Default Passenger Count
            </label>
            <select
              id="passengers"
              value={defaultPassengerCount}
              onChange={(event) => setDefaultPassengerCount(Number(event.target.value))}
              className="h-10 w-full rounded-lg border border-input bg-background px-4 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-background p-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Account Created</dt>
              <dd className="mt-1 font-medium text-foreground">{createdAt}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current Email</dt>
              <dd className="mt-1 font-medium text-foreground">{initialUser.email}</dd>
            </div>
          </dl>
        </div>

        {message ? <p className="mt-5 text-sm text-primary">{message}</p> : null}
        {errorMessage ? <p className="mt-5 text-sm text-destructive">{errorMessage}</p> : null}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-destructive/40 bg-card p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delete Account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This removes your account, saved places, routes, alerts, and trip history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/20"
          >
            Delete Account
          </button>
        </div>
      </section>

      {isDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-foreground">Confirm Deletion</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Type DELETE to permanently remove your account and related data.
            </p>
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="mt-5 w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setDeleteConfirmation("");
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== "DELETE" || isDeleting}
                className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
