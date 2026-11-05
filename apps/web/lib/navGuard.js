/**
 * Should a click on `anchor` be stopped because the page has unsaved changes?
 * Only same-tab, in-app navigations to a different page are blocked; new-tab
 * clicks, downloads, external links and same-page #hash jumps pass through.
 *
 * @param {{ href?: string, target?: string, hasDownload?: boolean }} anchor
 * @param {{ button?: number, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} click
 * @param {string} currentHref  window.location.href
 */
export function shouldBlockNavigation(anchor, click, currentHref) {
  if (!anchor?.href) return false;
  if ((click?.button ?? 0) !== 0) return false;
  if (click?.metaKey || click?.ctrlKey || click?.shiftKey || click?.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasDownload) return false;

  let next;
  let current;
  try {
    current = new URL(currentHref);
    next = new URL(anchor.href, current);
  } catch {
    return false;
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") return false;
  if (next.origin !== current.origin) return false;
  return next.pathname !== current.pathname || next.search !== current.search;
}
