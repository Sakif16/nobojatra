/**
 * Slippy-map tile addressing, as the traffic tile proxy accepts it.
 *
 * A zoom level `z` has 2^z tiles a side, so x and y run from 0 to 2^z - 1.
 * Anything else is not a tile, and forwarding it only spends a provider call
 * on an answer that is certain to be an error.
 */

/** The deepest zoom the traffic flow tiles are served at. */
export const MAX_TILE_ZOOM = 22;

export type TileCoordinates = { z: number; x: number; y: number };

export function parseTileCoordinates(
  z: string,
  x: string,
  y: string,
): TileCoordinates | null {
  // Plain digits only: no signs, decimals, exponents or padding tricks, and
  // short enough that the numbers below are exact.
  if (![z, x, y].every((value) => /^\d{1,8}$/.test(value))) return null;

  const tile = { z: Number(z), x: Number(x), y: Number(y) };

  if (tile.z > MAX_TILE_ZOOM) return null;

  const tilesPerSide = 2 ** tile.z;

  return tile.x < tilesPerSide && tile.y < tilesPerSide ? tile : null;
}
