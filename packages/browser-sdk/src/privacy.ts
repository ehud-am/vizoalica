import { redactReferrer, redactUrl } from '@vizoalica/privacy';

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
