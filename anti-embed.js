// GitHub Pages cannot set HTTP response headers. Prevent the page from being
// rendered when it is loaded in a frame as a defense-in-depth fallback. The
// production Cloudflare rule documented in the README is the authoritative
// protection because browsers enforce it before any page code runs.
if (window.top !== window.self) {
  try {
    window.top.location.href = window.location.href;
  } catch {
    // A sandboxed frame cannot navigate its parent. Keep this document hidden.
  }

  document.documentElement.style.display = "none";
}
