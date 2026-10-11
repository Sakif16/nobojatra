/**
 * The third-party app the live-cams page embeds. Named once because three
 * things have to agree on it: the iframe that loads it, the content security
 * policy that allows it to be framed, and the permissions policy in
 * next.config.ts that lets it use the camera.
 */
export const LIVE_CAMS_URL = "https://traffic-punk-re.onrender.com/?embed=1";

export const LIVE_CAMS_ORIGIN = new URL(LIVE_CAMS_URL).origin;
