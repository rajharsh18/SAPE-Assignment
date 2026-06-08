export const ANALYTICS_REFRESH = "samayak:analytics-refresh";

export function notifyAnalyticsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ANALYTICS_REFRESH));
  }
}

export function onAnalyticsRefresh(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ANALYTICS_REFRESH, callback);
  return () => window.removeEventListener(ANALYTICS_REFRESH, callback);
}
