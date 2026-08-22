"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/field-styles";
import PlaceAutocomplete from "@/components/map/PlaceAutocomplete";
import {
  COUNTRY_CONFIG,
  COUNTRY_OPTIONS,
  type CountryCode,
} from "@/lib/country-config";
import type { PlaceResult } from "@/lib/geocode";
import BackLink from "@/components/BackLink";

type TravelPriority = "time" | "cost" | "comfort";

// One row's local editing state — mirrors the StopField pattern used in
// RouteFinderForm: a typed label plus the place once actually selected
type SavedPlaceRow = {
  key: string; // stable React key, independent of the (possibly still-empty) label
  label: string;
  labelEditable: boolean; // false for the fixed Home/Work rows
  placeLabel: string;
  place: PlaceResult | null;
};

type SavedPlaceInput = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

type ProfileFormProps = {
  initialUser: {
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  };
  initialProfile: {
    country: CountryCode;
    defaultTravelPriority: TravelPriority;
    defaultPassengerCount: number;
    savedPlaces: SavedPlaceInput[];
  };
};

const travelPriorities: Array<{ label: string; value: TravelPriority }> = [
  { label: "Time", value: "time" },
  { label: "Cost", value: "cost" },
  { label: "Comfort", value: "comfort" },
];

const MAX_SAVED_PLACES = 10;
let rowKeyCounter = 0;
function nextRowKey() {
  rowKeyCounter += 1;
  return `row-${rowKeyCounter}`;
}

function toRow(saved: SavedPlaceInput | undefined, label: string, labelEditable: boolean): SavedPlaceRow {
  return {
    key: nextRowKey(),
    label: saved?.label ?? label,
    labelEditable,
    placeLabel: saved?.place.label ?? "",
    place: saved ? { label: saved.place.label, lat: saved.place.lat, lng: saved.place.lng } : null,
  };
}

export default function ProfileForm({ initialUser, initialProfile }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [country, setCountry] = useState<CountryCode>(initialProfile.country);
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
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Home and Work are always shown as fixed rows (label locked); everything
  // else the user has saved becomes an editable-label custom row.
  const [homeRow, setHomeRow] = useState<SavedPlaceRow>(() =>
    toRow(initialProfile.savedPlaces.find((p) => p.label === "Home"), "Home", false),
  );
  const [workRow, setWorkRow] = useState<SavedPlaceRow>(() =>
    toRow(initialProfile.savedPlaces.find((p) => p.label === "Work"), "Work", false),
  );
  const [customRows, setCustomRows] = useState<SavedPlaceRow[]>(() =>
    initialProfile.savedPlaces
      .filter((p) => p.label !== "Home" && p.label !== "Work")
      .map((p) => toRow(p, p.label, true)),
  );

  const totalSavedRows = 2 + customRows.length; // Home + Work always count toward the cap
  const canAddCustomRow = totalSavedRows < MAX_SAVED_PLACES;

  const createdAt = useMemo(() => {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(initialUser.createdAt));
  }, [initialUser.createdAt]);

  function addCustomRow() {
    if (!canAddCustomRow) return;
    setCustomRows((rows) => [
      ...rows,
      { key: nextRowKey(), label: "", labelEditable: true, placeLabel: "", place: null },
    ]);
  }

  function removeCustomRow(key: string) {
    setCustomRows((rows) => rows.filter((row) => row.key !== key));
  }

  function updateCustomLabel(key: string, label: string) {
    setCustomRows((rows) => rows.map((row) => (row.key === key ? { ...row, label } : row)));
  }

  function selectCustomPlace(key: string, place: PlaceResult) {
    setCustomRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, place, placeLabel: place.label } : row)),
    );
  }

  function buildSavedPlacesPayload(): SavedPlaceInput[] {
    const payload: SavedPlaceInput[] = [];

    if (homeRow.place) {
      payload.push({ label: "Home", place: { label: homeRow.place.label, lat: homeRow.place.lat, lng: homeRow.place.lng } });
    }
    if (workRow.place) {
      payload.push({ label: "Work", place: { label: workRow.place.label, lat: workRow.place.lat, lng: workRow.place.lng } });
    }
    for (const row of customRows) {
      if (row.label.trim() && row.place) {
        payload.push({
          label: row.label.trim(),
          place: { label: row.place.label, lat: row.place.lat, lng: row.place.lng },
        });
      }
    }

    return payload;
  }

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
        country,
        defaultTravelPriority,
        defaultPassengerCount,
        savedPlaces: buildSavedPlacesPayload(),
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

  const closeDeleteDialog = () => {
    setIsDeleteOpen(false);
    setDeleteConfirmation("");
    setDeletePassword("");
    setDeleteError("");
  };

  const handleDeleteAccount = async () => {
    setMessage("");
    setErrorMessage("");
    setDeleteError("");
    setIsDeleting(true);

    const response = await fetch("/api/profile", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmation: deleteConfirmation,
        password: deletePassword,
      }),
    });
    const result = (await response.json()) as { message?: string };

    setIsDeleting(false);

    if (!response.ok) {
      // Shown inside the dialog rather than behind it, so a wrong password is
      // visible next to the field that caused it and the dialog stays open.
      setDeleteError(result.message || "Unable to delete account.");
      setDeletePassword("");
      return;
    }

    window.location.replace("/signin");
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <BackLink href="/" label="Back to planner" className="mb-4" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your account and travel defaults.</p>
      </div>

      <form onSubmit={handleSave} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
              className={fieldClassName()}
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
              className={fieldClassName()}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Status: {initialUser.emailVerified ? "Verified" : "Not verified"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-medium">Default Travel Priority</span>
            {/* Same segmented-control shape as the trip form's Leave now / Schedule toggle. */}
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-input">
              {travelPriorities.map((priority) => (
                <label
                  key={priority.value}
                  className="flex h-11 cursor-pointer items-center justify-center bg-secondary/60 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
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
            <label htmlFor="country" className="mb-2 block text-sm font-medium">
              Country
            </label>
            <select
              id="country"
              value={country}
              onChange={(event) => setCountry(event.target.value as CountryCode)}
              className={fieldClassName(false, "h-11 py-0")}
            >
              {COUNTRY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {COUNTRY_CONFIG[code].label}
                </option>
              ))}
            </select>
            {/* Naming the consequences here rather than in a tooltip: this is
                the one control that changes which places are searchable, which
                services appear and what currency fares are quoted in. */}
            <p className="mt-2 text-xs text-muted-foreground">
              Sets your service area ({COUNTRY_CONFIG[country].serviceAreaName}), the ride
              services offered and the currency fares are shown in. Trips you have already
              planned keep the country they were planned in.
            </p>
          </div>

          <div>
            <label htmlFor="passengers" className="mb-2 block text-sm font-medium">
              Default Passenger Count
            </label>
            <select
              id="passengers"
              value={defaultPassengerCount}
              onChange={(event) => setDefaultPassengerCount(Number(event.target.value))}
              className={fieldClassName(false, "h-11 py-0")}
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Saved Places ── */}
        <div className="mt-8">
          <span className="mb-1 block text-sm font-medium">Saved Places</span>
          <p className="mb-3 text-xs text-muted-foreground">
            These appear as one-tap shortcuts when searching for an origin or
            destination. Only places inside {COUNTRY_CONFIG[country].serviceAreaName} are
            offered while that is your country — the rest stay saved here and come back
            when you switch.
          </p>

          <div className="space-y-2.5">
            {/* Home — fixed label */}
            <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/40 px-3 py-2.5">
              <span className="w-14 flex-shrink-0 text-sm font-medium text-foreground">Home</span>
              <div className="flex-1">
                <PlaceAutocomplete
                  placeholder="Search for your home address"
                  value={homeRow.placeLabel}
                  onChange={(v) => setHomeRow((r) => ({ ...r, placeLabel: v, place: v ? r.place : null }))}
                  onSelect={(place) => setHomeRow((r) => ({ ...r, place, placeLabel: place.label }))}
                  className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                />
              </div>
            </div>

            {/* Work — fixed label */}
            <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/40 px-3 py-2.5">
              <span className="w-14 flex-shrink-0 text-sm font-medium text-foreground">Work</span>
              <div className="flex-1">
                <PlaceAutocomplete
                  placeholder="Search for your work address"
                  value={workRow.placeLabel}
                  onChange={(v) => setWorkRow((r) => ({ ...r, placeLabel: v, place: v ? r.place : null }))}
                  onSelect={(place) => setWorkRow((r) => ({ ...r, place, placeLabel: place.label }))}
                  className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                />
              </div>
            </div>

            {/* Custom rows — editable label */}
            {customRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center gap-3 rounded-xl border border-input bg-secondary/40 px-3 py-2.5"
              >
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateCustomLabel(row.key, e.target.value)}
                  placeholder="Label"
                  maxLength={40}
                  className="w-20 flex-shrink-0 rounded-lg border-none bg-transparent px-1 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground focus:bg-secondary"
                />
                <div className="flex-1">
                  <PlaceAutocomplete
                    placeholder="Search for a place"
                    value={row.placeLabel}
                    onChange={(v) =>
                      setCustomRows((rows) =>
                        rows.map((r) => (r.key === row.key ? { ...r, placeLabel: v, place: v ? r.place : null } : r)),
                      )
                    }
                    onSelect={(place) => selectCustomPlace(row.key, place)}
                    className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeCustomRow(row.key)}
                  aria-label="Remove saved place"
                  className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addCustomRow}
            disabled={!canAddCustomRow}
            className="mt-2.5 text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            + Add custom place ({totalSavedRows}/{MAX_SAVED_PLACES})
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background p-4">
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
            className={buttonVariants({ size: "md" })}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-destructive/40 bg-card p-6">
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
            className={buttonVariants({ variant: "destructive", size: "md" })}
          >
            Delete Account
          </button>
        </div>
      </section>

      {isDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-foreground">Confirm Deletion</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Type DELETE and enter your password to permanently remove your account and
              related data. This cannot be undone.
            </p>
            <label htmlFor="delete-confirmation" className="mt-5 mb-2 block text-sm font-medium">
              Type DELETE
            </label>
            <input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className={fieldClassName(false)}
            />
            <label htmlFor="delete-password" className="mt-4 mb-2 block text-sm font-medium">
              Password
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className={fieldClassName(Boolean(deleteError))}
            />
            {deleteError ? (
              <p className="mt-2 text-sm text-destructive">{deleteError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className={buttonVariants({ variant: "outline", size: "md" })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={
                  deleteConfirmation !== "DELETE" || deletePassword.length === 0 || isDeleting
                }
                className={buttonVariants({ variant: "destructive", size: "md" })}
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