// ==========================================================
// navigation.js
// ----------------------------------------------------------
// Handles switching between pages (Dashboard, Spare Parts,
// Issue, Receive, Reports, Staff). It doesn't know or care
// about spare parts data — it only toggles which <section
// class="page"> is visible and which sidebar button is
// highlighted.
// ==========================================================
import { $ } from "./dom.js";
import { closeSidebar } from "./layout.js";

const pageTitles = {
  dashboard: "Dashboard",
  spares: "Inventory",
  issue: "Issue Spares",
  receive: "Receive Stock",
  activity: "Alerts & Activity",
  reports: "Reports & Gmail",
  staff: "Staff Management",
};

// Exported (not just used internally) because transactions.js
// also needs to jump back to the dashboard after a successful
// issue/receive — so other files need to "borrow" this function.
export function navigate(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === page));
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("pageTitle").textContent = pageTitles[page];
  // Whether the sidebar is open or already closed, this is a safe
  // no-op call — it just makes sure that picking a page always
  // leaves the drawer closed afterward.
  closeSidebar();
}

// Wires up every element with a data-page attribute (sidebar
// buttons, plus a couple of shortcut buttons like "View all").
export function setupNavigationEvents() {
  document.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.page)));
}
