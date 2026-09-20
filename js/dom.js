// ==========================================================
// dom.js
// ----------------------------------------------------------
// Tiny helpers used all over the app. Nothing about
// spare parts, staff, or reports lives here on purpose —
// this file only knows about the page itself.
// ==========================================================

// Shorthand for document.getElementById. Instead of typing
// document.getElementById("totalStock") everywhere, we type $("totalStock").
export const $ = (id) => document.getElementById(id);

// ==========================================================
// MODAL SYSTEM
// ----------------------------------------------------------
// Three functions — toast(), confirmModal(), promptModal() — all
// share the ONE modal in index.html (#modalBackdrop), rather than
// each having its own markup. What changes between them is which
// pieces show (Cancel button? text input?) and what a click on OK
// resolves the returned Promise with:
//   - toast(msg)            fire-and-forget, just an OK button
//   - confirmModal(msg)     await it — resolves true/false
//   - promptModal(msg, ...) await it — resolves the typed string,
//                            or null if cancelled (same as the
//                            browser's own prompt() used to)
// Only one of these can be open at a time, which matches how the
// app actually uses them — nothing calls a second one before the
// first is dismissed.
// ==========================================================
let currentMode = null; // "alert" | "confirm" | "prompt"
let resolveCurrent = null;
let boundOnce = false;

function ensureModalBound() {
  if (boundOnce) return;
  boundOnce = true;

  $("modalOkBtn").addEventListener("click", () => closeModal(true));
  $("modalCancelBtn").addEventListener("click", () => closeModal(false));
  // Only closes when the click lands ON the backdrop itself, not
  // when it lands on the box and bubbles up.
  $("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal(false);
  });
  // Enter submits from the prompt's input field, same as clicking
  // OK. Escape cancels from anywhere, but only while a modal is
  // actually open — otherwise it would fire on every Escape press
  // in the whole app.
  $("modalInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeModal(true);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modalBackdrop").classList.contains("hidden")) closeModal(false);
  });
}

function openModal({ message, mode, okLabel, showCancel, showInput, placeholder }) {
  ensureModalBound();
  currentMode = mode;
  $("modalMessage").textContent = message;
  $("modalOkBtn").textContent = okLabel;
  $("modalCancelBtn").classList.toggle("hidden", !showCancel);
  $("modalInput").classList.toggle("hidden", !showInput);
  $("modalInput").value = "";
  $("modalInput").placeholder = placeholder || "";
  $("modalBackdrop").classList.remove("hidden");
  if (showInput) setTimeout(() => $("modalInput").focus(), 0);

  return new Promise((resolve) => {
    resolveCurrent = resolve;
  });
}

function closeModal(accepted) {
  const backdrop = $("modalBackdrop");
  if (backdrop.classList.contains("hidden")) return; // nothing open — ignore stray Escape presses etc.
  backdrop.classList.add("hidden");

  const resolve = resolveCurrent;
  const mode = currentMode;
  resolveCurrent = null;
  currentMode = null;
  if (!resolve) return;

  if (mode === "prompt") resolve(accepted ? $("modalInput").value : null);
  else if (mode === "confirm") resolve(accepted);
  else resolve(undefined); // "alert" — nothing meaningful to return
}

// Shows a message with just an OK button. Nothing calling this
// needs to change or await it — it behaves exactly like the old
// toast() from the outside, just rendered as a modal instead of a
// corner banner.
export function toast(msg) {
  openModal({ message: msg, mode: "alert", okLabel: "OK", showCancel: false, showInput: false });
}

// Yes/No confirmation. `await` it — resolves true if OK was
// clicked, false for Cancel, the backdrop, or Escape. Replaces the
// browser's own confirm(msg).
export function confirmModal(msg, okLabel = "Confirm") {
  return openModal({ message: msg, mode: "confirm", okLabel, showCancel: true, showInput: false });
}

// Type-to-confirm prompt. `await` it — resolves the typed text if
// OK was clicked, or null for Cancel/backdrop/Escape (matching what
// the browser's own prompt(msg) returns on cancel). Replaces
// prompt(msg).
export function promptModal(msg, { placeholder, okLabel = "Confirm" } = {}) {
  return openModal({ message: msg, mode: "prompt", okLabel, showCancel: true, showInput: true, placeholder });
}
