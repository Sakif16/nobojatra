import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

const { placeAfterTextChange, savedPlaceDraftError } = load("lib/profile-place-draft.ts");
const place = { label: "Home address", lat: 23.7, lng: 90.4 };

test("changing an address invalidates its previously selected coordinates", () => {
  assert.equal(placeAfterTextChange(place, place.label), place);
  assert.equal(placeAfterTextChange(place, "Another address"), null);
  assert.match(savedPlaceDraftError([{ label: "Home", placeLabel: "Another address", place: null }], []), /suggestions/);
});

test("saved place validation allows cleared and selected places but requires a custom label", () => {
  const empty = { label: "Home", placeLabel: "", place: null };
  const selected = { label: "Shop", placeLabel: place.label, place };
  assert.equal(savedPlaceDraftError([empty, selected], [selected]), null);
  assert.match(savedPlaceDraftError([{ ...selected, label: "" }], [{ ...selected, label: "" }]), /label/);
});
