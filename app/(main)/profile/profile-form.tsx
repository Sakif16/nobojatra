"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Home, Briefcase, MapPin, Minus, Plus, Pencil, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/field-styles";
import PlaceAutocomplete from "@/components/map/PlaceAutocomplete";
import {
  COUNTRY_CONFIG,
  COUNTRY_OPTIONS,
  type CountryCode,
} from "@/lib/country-config";
import type { PlaceResult } from "@/lib/geocode";
import { readJson, UnexpectedResponseError } from "@/lib/read-json";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import Chip from "@/components/ui/chip";
import ListRow from "@/components/ui/list-row";
import { placeAfterTextChange, savedPlaceDraftError } from "@/lib/profile-place-draft";
import { Dialog } from "@base-ui/react/dialog";

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
    /** False for Google-only accounts, which confirm deletion without one. */
    hasPassword: boolean;
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
    const draftError = savedPlaceDraftError([homeRow, workRow, ...customRows], customRows);
    if (draftError) {
      setErrorMessage(draftError);
      return;
    }
    setIsSaving(true);

    // The button is released in `finally`, so a dropped connection or a reply
    // that is not JSON cannot leave it stuck on "Saving…".
    try {
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
      const result = await readJson<{ message?: string }>(response);

      if (!response.ok) {
        setErrorMessage(result.message || "Unable to save profile.");
        return;
      }

      setMessage(result.message || "Profile saved.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof UnexpectedResponseError
          ? error.message
          : "Unable to save profile. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
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

    try {
      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation: deleteConfirmation,
          ...(initialUser.hasPassword ? { password: deletePassword } : {}),
        }),
      });
      const result = await readJson<{ message?: string }>(response);

      if (!response.ok) {
        // Shown inside the dialog rather than behind it, so a wrong password is
        // visible next to the field that caused it and the dialog stays open.
        setDeleteError(result.message || "Unable to delete account.");
        setDeletePassword("");
        return;
      }

      window.location.replace("/signin");
    } catch (error) {
      setDeleteError(
        error instanceof UnexpectedResponseError
          ? error.message
          : "Unable to delete account. Check your connection and try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader title="Profile" back={{ href: "/", label: "Back to planner" }} subtitle="Manage your account and travel defaults." />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Profile sections" className="flex flex-wrap gap-2 lg:sticky lg:top-[calc(var(--app-header-height)+1rem)] lg:flex-col">
        {[["account", "Account"], ["travel-defaults", "Travel defaults"], ["saved-places", "Saved places"], ["danger-zone", "Danger zone"]].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>)}
      </nav>
      <div className="space-y-6">

      <form onSubmit={handleSave} className="space-y-4">
        <Panel id="account" padding="lg" className="scroll-mt-24"><h2 className="mb-4 text-lg font-semibold">Account</h2>
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

        </Panel>
        <Panel id="travel-defaults" padding="lg" className="scroll-mt-24"><h2 className="mb-4 text-lg font-semibold">Travel defaults</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <span className="mb-2 block text-sm font-medium">Default Travel Priority</span>
            <div role="group" aria-label="Default travel priority" className="flex flex-wrap gap-2">
              {travelPriorities.map((priority) => (
                <Chip key={priority.value} selected={defaultTravelPriority === priority.value} buttonProps={{ onClick: () => setDefaultTravelPriority(priority.value) }}>{priority.label}</Chip>
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
            <span id="passengers-label" className="mb-2 block text-sm font-medium">
              Default Passenger Count
            </span>
            <div role="group" aria-labelledby="passengers-label" className="inline-flex items-center gap-3 rounded-full border border-input bg-secondary/40 p-1">
              <button type="button" aria-label="Decrease default passengers" disabled={defaultPassengerCount <= 1} onClick={() => setDefaultPassengerCount((count) => Math.max(1, count - 1))} className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="size-4" aria-hidden /></button>
              <span aria-live="polite" className="min-w-4 text-center tabular-nums">{defaultPassengerCount}</span>
              <button type="button" aria-label="Increase default passengers" disabled={defaultPassengerCount >= 8} onClick={() => setDefaultPassengerCount((count) => Math.min(8, count + 1))} className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="size-4" aria-hidden /></button>
            </div>
          </div>
        </div>
        </Panel>

        {/* ── Saved Places ── */}
        <Panel id="saved-places" padding="lg" className="scroll-mt-24">
          <span className="mb-1 block text-sm font-medium">Saved Places</span>
          <p className="mb-3 text-xs text-muted-foreground">
            These appear as one-tap shortcuts when searching for an origin or
            destination. Only places inside {COUNTRY_CONFIG[country].serviceAreaName} are
            offered while that is your country — the rest stay saved here and come back
            when you switch.
          </p>

          <div className="space-y-2.5">
            <ListRow staticRow className="border-input bg-secondary/40" leading={<Home className="size-4 text-primary" aria-hidden />} title="Home"
              meta={<PlaceAutocomplete id="profile-home-place" placeholder="Search for your home address" value={homeRow.placeLabel}
                onChange={(v) => setHomeRow((r) => ({ ...r, placeLabel: v, place: placeAfterTextChange(r.place, v) }))}
                onSelect={(place) => setHomeRow((r) => ({ ...r, place, placeLabel: place.label }))}
                className="border-none bg-transparent px-0 py-0 focus:bg-transparent" />}
              trailing={<span className="flex"><button type="button" onClick={() => document.getElementById("profile-home-place")?.focus()} aria-label="Edit home address" className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted"><Pencil className="size-4" aria-hidden /></button><button type="button" aria-label="Remove home address" onClick={() => setHomeRow((row) => ({ ...row, placeLabel: "", place: null }))} className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X className="size-4" aria-hidden /></button></span>} />
            <ListRow staticRow className="border-input bg-secondary/40" leading={<Briefcase className="size-4 text-primary" aria-hidden />} title="Work"
              meta={<PlaceAutocomplete id="profile-work-place" placeholder="Search for your work address" value={workRow.placeLabel}
                onChange={(v) => setWorkRow((r) => ({ ...r, placeLabel: v, place: placeAfterTextChange(r.place, v) }))}
                onSelect={(place) => setWorkRow((r) => ({ ...r, place, placeLabel: place.label }))}
                className="border-none bg-transparent px-0 py-0 focus:bg-transparent" />}
              trailing={<span className="flex"><button type="button" onClick={() => document.getElementById("profile-work-place")?.focus()} aria-label="Edit work address" className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted"><Pencil className="size-4" aria-hidden /></button><button type="button" aria-label="Remove work address" onClick={() => setWorkRow((row) => ({ ...row, placeLabel: "", place: null }))} className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X className="size-4" aria-hidden /></button></span>} />
            {customRows.map((row, index) => <ListRow key={row.key} staticRow className="border-input bg-secondary/40"
              leading={<MapPin className="size-4 text-primary" aria-hidden />}
              title={<input type="text" value={row.label} onChange={(event) => updateCustomLabel(row.key, event.target.value)} placeholder="Label" aria-label="Saved place label" maxLength={40} className="w-full rounded-lg border-none bg-transparent px-1 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground focus:bg-secondary" />}
              meta={<PlaceAutocomplete id={`profile-place-${index}`} placeholder="Search for a place" value={row.placeLabel}
                onChange={(v) => setCustomRows((rows) => rows.map((r) => r.key === row.key ? { ...r, placeLabel: v, place: placeAfterTextChange(r.place, v) } : r))}
                onSelect={(place) => selectCustomPlace(row.key, place)} className="border-none bg-transparent px-0 py-0 focus:bg-transparent" />}
              trailing={<span className="flex"><button type="button" onClick={() => document.getElementById(`profile-place-${index}`)?.focus()} aria-label={`Edit ${row.label || "saved place"}`} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted"><Pencil className="size-4" aria-hidden /></button><button type="button" onClick={() => removeCustomRow(row.key)} aria-label={`Remove ${row.label || "saved place"}`} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} aria-hidden /></button></span>} />)}
          </div>

          <button
            type="button"
            onClick={addCustomRow}
            disabled={!canAddCustomRow}
            className="mt-2.5 text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            + Add custom place ({totalSavedRows}/{MAX_SAVED_PLACES})
          </button>
        </Panel>

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

        {message ? (
          <p role="status" className="mt-5 text-sm text-primary">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

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

      <Panel id="danger-zone" padding="lg" className="scroll-mt-24 border-destructive/40">
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
      </Panel>

      {isDeleteOpen ? (
        <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen && !isDeleting) closeDeleteDialog(); }}>
        <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-4">
          <Dialog.Popup className="w-full max-w-md outline-none"><Panel padding="lg" className="shadow-xl">
            <Dialog.Title className="text-xl font-semibold text-foreground">Confirm Deletion</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {initialUser.hasPassword
                ? "Type DELETE and enter your password to permanently remove your account and related data. This cannot be undone."
                : "Type DELETE to permanently remove your account and related data. This cannot be undone. If you signed in more than 15 minutes ago, you will be asked to sign in again first."}
            </Dialog.Description>
            <label htmlFor="delete-confirmation" className="mt-5 mb-2 block text-sm font-medium">
              Type DELETE
            </label>
            <input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className={fieldClassName(false)}
            />
            {initialUser.hasPassword ? (
              <>
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
              </>
            ) : null}
            {deleteError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close
                disabled={isDeleting}
                className={buttonVariants({ variant: "outline", size: "md" })}
              >
                Cancel
              </Dialog.Close>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={
                  deleteConfirmation !== "DELETE" ||
                  (initialUser.hasPassword && deletePassword.length === 0) ||
                  isDeleting
                }
                className={buttonVariants({ variant: "destructive", size: "md" })}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </Panel></Dialog.Popup>
        </Dialog.Viewport></Dialog.Portal></Dialog.Root>
      ) : null}
      </div>
      </div>
    </main>
  );
}
