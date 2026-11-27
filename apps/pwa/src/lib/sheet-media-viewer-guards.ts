export function isSheetMediaViewerTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-media-viewer]'));
}