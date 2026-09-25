export const openAllieEventName = "swiftpay:open-allie";

/** Open the Pay with ALLIE bubble from anywhere on the page. */
export function openAllie() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(openAllieEventName));
  }
}
