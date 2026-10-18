import {
  extractCampaign,
  redactReferrer,
  redactUrl,
  type CampaignLabels
} from '@vizoalica/privacy';

export function currentPage(
  locationLike: Pick<Location, 'href'> = globalThis.location
): ReturnType<typeof redactUrl> {
  return redactUrl(locationLike.href);
}

export function currentReferrer(
  documentLike: Pick<Document, 'referrer'> = globalThis.document
): { origin?: string } | undefined {
  return redactReferrer(documentLike.referrer);
}

/** The page key used for in-page navigation and actions. */
export function currentPageKey(locationLike: Pick<Location, 'href'> = globalThis.location): string {
  return currentPage(locationLike).url_path;
}

/**
 * The cleaned UTM labels of the current URL, read once when the client starts. Only the three UTM
 * parameters are read; every other query value stays unread, as before.
 */
export function landingCampaign(
  locationLike: Pick<Location, 'href'> = globalThis.location
): CampaignLabels | undefined {
  try {
    return extractCampaign(new URL(locationLike.href).search);
  } catch {
    return undefined;
  }
}
