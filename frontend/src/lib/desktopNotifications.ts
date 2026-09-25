/** Browser notifications are intentionally limited to background tabs: an in-app reply is
 * already visible while Lofin has focus, and foreground popups would be noisy. */
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notifyReplyFinished(): void {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    document.visibilityState !== "hidden"
  ) return;

  try {
    const notification = new Notification("Lofin", {
      body: "Your reply is ready.",
      icon: "/pwa-192.png",
      tag: "lofin-reply-ready",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notifications can be blocked by a browser or OS setting after permission was granted.
  }
}
