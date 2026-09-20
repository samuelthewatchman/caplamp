import { setupLayoutEvents } from "./layout.js";
import { setupNavigationEvents } from "./navigation.js";
import { setupAuthEvents } from "./auth.js";
import { setupTransactionEvents } from "./transactions.js";
import { setupReportEvents } from "./reports.js";
import { setupTableSorting, setupInventorySearch } from "./inventory.js";
import { setupItemEvents } from "./items.js";
import { setupStaffAdminEvents } from "./staffAdmin.js";

setupLayoutEvents();
setupNavigationEvents();
setupAuthEvents();
setupTransactionEvents();
setupReportEvents();
setupTableSorting();
setupInventorySearch();
setupItemEvents();
setupStaffAdminEvents();

// Registers sw.js so Chrome/Android will treat this as a real
// installable app rather than just a bookmark. Feature-checked
// because older browsers don't have navigator.serviceWorker at
// all — without this check, this line would throw and stop the
// rest of the app's setup above from running in those browsers.
// sw.js only works over https (or on localhost while testing), so
// this quietly does nothing on a plain http deployment — nothing
// else in the app depends on it succeeding.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("Service worker registration failed:", err));
  });
}