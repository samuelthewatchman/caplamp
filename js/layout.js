// ==========================================================
// layout.js
// ----------------------------------------------------------
// Handles the page "shell" behavior that isn't really about
// any one page: opening and closing the popup sidebar. Kept
// separate from navigation.js on purpose — navigation.js
// decides WHICH page shows, this file decides whether the
// sidebar drawer is visible. Two different jobs.
// ==========================================================
import { $ } from "./dom.js";

export function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebarBackdrop").classList.remove("hidden");
}

export function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarBackdrop").classList.add("hidden");
}

export function setupLayoutEvents() {
  $("menuToggle").addEventListener("click", openSidebar);
  // Clicking the dark overlay behind the sidebar closes it —
  // same idea as clicking outside a dropdown to dismiss it.
  $("sidebarBackdrop").addEventListener("click", closeSidebar);
}
