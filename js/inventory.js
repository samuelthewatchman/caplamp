// ==========================================================
// inventory.js
// ----------------------------------------------------------
// Everything about DISPLAYING spare parts data: the dashboard
// cards, the stock table, the spare parts register, low-stock
// alerts, recent activity, and the staff table. This file
// reads data from state.js but never changes it directly —
// changing data happens in transactions.js and auth.js.
//
// New in this version: sortable table headers, a live search box
// on the Inventory page, and numbers that animate smoothly instead
// of just snapping to a new value.
// ==========================================================
import { $ } from "./dom.js";
import { staff, items, activity, session, issuedTodayTotal, issuedThisWeekTotal, issuedThisMonthTotal, issuedThisYearTotal } from "./state.js";
import { renderReport } from "./reports.js";

// Decides which colored "pill" a spare part gets based on how
// close its balance is to its minimum stock level.
export function status(i) {
  return i.balance <= i.min
    ? '<span class="pill bad">Low stock</span>'
    : i.balance <= i.min * 1.5
    ? '<span class="pill warn">Watch</span>'
    : '<span class="pill good">Healthy</span>';
}

// ----------------------------------------------------------
// SORTING
// ----------------------------------------------------------
// One little state object per sortable table, remembering which
// column it's currently sorted by (key) and which direction
// (dir: 1 = ascending, -1 = descending). "key: null" means "keep
// the original, unsorted order."
//
// Why not just sort the <tr> rows directly in the DOM? Because
// render() rebuilds these tables from scratch every time something
// changes (a new issue/receive, a search, etc.) — a DOM-only sort
// would just get wiped out on the very next render. Sorting the
// underlying data instead, and re-sorting it every render, means
// the sort "sticks" no matter what triggers a redraw.
const stockSort = { key: null, dir: 1 };
const spareSort = { key: null, dir: 1 };

// Live search text for the Inventory page, kept here so render()
// can filter by it every time it redraws that table.
let spareSearchText = "";

function sortItems(list, sort) {
  if (!sort.key) return list;
  const copy = [...list];
  copy.sort((a, b) => {
    let av = a[sort.key];
    let bv = b[sort.key];
    if (typeof av === "string") {
      av = av.toLowerCase();
      bv = bv.toLowerCase();
    }
    if (av < bv) return -1 * sort.dir;
    if (av > bv) return 1 * sort.dir;
    return 0;
  });
  return copy;
}

// Wires up click listeners on every <th data-sort="..."> inside a
// given table's header. Clicking a column sorts by it; clicking the
// SAME column again flips ascending/descending instead of doing
// nothing, which is the behavior people expect from sortable tables.
function attachSort(theadSelector, sortState) {
  const thead = document.querySelector(theadSelector);
  if (!thead) return;
  const headers = thead.querySelectorAll("th[data-sort]");
  headers.forEach((th) => {
    th.classList.add("sortable");
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      sortState.dir = sortState.key === key ? sortState.dir * -1 : 1;
      sortState.key = key;
      headers.forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(sortState.dir === 1 ? "sort-asc" : "sort-desc");
      render();
    });
  });
}

// Call this once, at startup (see main.js), to make both tables'
// headers clickable. Only needs to run once — the click listeners
// stay attached for the life of the page.
export function setupTableSorting() {
  attachSort("#dashboard table thead", stockSort);
  attachSort("#spares table thead", spareSort);
}

// Wires up the Inventory page's search box. Every keystroke updates
// spareSearchText and re-renders — with only a handful of items this
// is instant, no need for anything fancier like debouncing.
export function setupInventorySearch() {
  const input = $("spareSearch");
  if (!input) return;
  input.addEventListener("input", () => {
    spareSearchText = input.value.trim().toLowerCase();
    render();
  });
}

// ----------------------------------------------------------
// ANIMATED NUMBERS
// ----------------------------------------------------------
// Smoothly counts a metric from whatever it currently shows toward
// its new value, instead of just replacing the text instantly. Reads
// the element's OWN current number as the starting point, so this
// works both the first time (0 -> value) and every time after (old
// value -> new value).
function animateMetric(el, targetValue, format) {
  const digitsOnly = el.textContent.replace(/[^0-9.]/g, "");
  const startValue = parseFloat(digitsOnly) || 0;
  const duration = 600;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    // "Ease out": moves fast at first and gently settles at the end,
    // which reads as smoother than a plain constant-speed count.
    const eased = 1 - (1 - progress) * (1 - progress);
    const current = Math.round(startValue + (targetValue - startValue) * eased);
    el.textContent = format(current);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// The big one: re-reads all the data and redraws every part of
// the app that shows it. Called after login, and after every
// issue/receive transaction, so the screen never goes stale.
export function render() {
  const totalStock = items.reduce((s, i) => s + i.balance, 0);
  const issuedToday = issuedTodayTotal();
  const lowCount = items.filter((i) => i.balance <= i.min).length;
  const stockValue = items.reduce((s, i) => s + i.balance * i.price, 0);

  animateMetric($("totalStock"), totalStock, (n) => n.toLocaleString());
  animateMetric($("issuedToday"), issuedToday, (n) => n.toLocaleString());
  animateMetric($("lowCount"), lowCount, (n) => String(n));
  animateMetric($("stockValue"), stockValue, (n) => "GH₵ " + n.toLocaleString());

  // Stock Usage Overview bars: real issued totals now, not the old
  // hardcoded 37/146/512/4,820. Bar widths are scaled against
  // whichever of the four numbers is largest, so the bars stay
  // visually meaningful relative to each other instead of using
  // arbitrary fixed percentages.
  const usage = {
    today: issuedTodayTotal(),
    week: issuedThisWeekTotal(),
    month: issuedThisMonthTotal(),
    year: issuedThisYearTotal(),
  };
  const usageMax = Math.max(usage.today, usage.week, usage.month, usage.year, 1);
  $("usageToday").textContent = usage.today.toLocaleString();
  $("usageWeek").textContent = usage.week.toLocaleString();
  $("usageMonth").textContent = usage.month.toLocaleString();
  $("usageYear").textContent = usage.year.toLocaleString();
  $("usageTodayFill").style.width = (usage.today / usageMax) * 100 + "%";
  $("usageWeekFill").style.width = (usage.week / usageMax) * 100 + "%";
  $("usageMonthFill").style.width = (usage.month / usageMax) * 100 + "%";
  $("usageYearFill").style.width = (usage.year / usageMax) * 100 + "%";

  // Sidebar badge: only show it at all when there's something to
  // flag — an empty "0" badge just adds visual noise.
  $("lowBadge").textContent = lowCount;
  $("lowBadge").classList.toggle("hidden", lowCount === 0);

  $("stockTable").innerHTML = sortItems(items, stockSort)
    .map((i) => `<tr><td>${i.name}</td><td>${i.opening}</td><td>${i.issued}</td><td><b>${i.balance}</b></td><td>${status(i)}</td></tr>`)
    .join("");

  const filteredSpares = items.filter(
    (i) =>
      !spareSearchText ||
      i.name.toLowerCase().includes(spareSearchText) ||
      i.code.toLowerCase().includes(spareSearchText) ||
      i.category.toLowerCase().includes(spareSearchText)
  );
  const isAdmin = session.currentUser?.role === "admin";
  $("allSpares").innerHTML =
    sortItems(filteredSpares, spareSort)
      .map(
        (i) =>
          `<tr><td>${i.code}</td><td>${i.name}</td><td>${i.category}</td><td><b>${i.balance}</b></td><td>${i.min}</td><td>${status(i)}</td><td>${
            isAdmin
              ? `<button type="button" class="btn gray editItemBtn" data-id="${i.id}">Edit</button> <button type="button" class="btn danger deleteItemBtn" data-id="${i.id}">Delete</button>`
              : ""
          }</td></tr>`
      )
      .join("") || '<tr><td colspan="7" class="muted">No items match your search.</td></tr>';

  $("alerts").innerHTML =
    items
      .filter((i) => i.balance <= i.min)
      .map((i) => `<div class="alert">⚠ <b>${i.name}</b> is below its minimum level. Remaining: ${i.balance}.</div>`)
      .join("") || '<div class="notice">No low-stock alerts.</div>';

  $("activityTable").innerHTML = activity
    .slice(-8)
    .reverse()
    .map((a) => `<tr><td>${a.date}</td><td>${a.name}</td><td>${a.action}</td><td>${a.qty}</td><td>${a.staff}</td><td class="muted">${a.details}</td></tr>`)
    .join("");

  $("staffTable").innerHTML = staff
    .map((s) => {
      const pillClass = s.status === "Active" ? "good" : "bad";
      const isSelf = session.currentUser?.staff_code === s.code;
      // Only admins get the toggle at all, and never on their own
      // row — an admin disabling themselves would lock them out
      // with no one left who could turn it back on.
      const canToggle = session.currentUser?.role === "admin" && !isSelf;
      const nextStatus = s.status === "Active" ? "Disabled" : "Active";
      const toggleBtn = canToggle
        ? `<button type="button" class="btn gray toggleStaffBtn" data-id="${s.id}" data-next="${nextStatus}">${
            s.status === "Active" ? "Disable" : "Enable"
          }</button>`
        : "";
      // Delete is deliberately narrower than the toggle above: never
      // your own row, and never another Admin's row (an admin account
      // can only be removed directly in the Supabase dashboard — see
      // admin-delete-staff, which refuses this on the server too, not
      // just here). This button only ever targets a Staff account.
      const canDelete = session.currentUser?.role === "admin" && !isSelf && s.role !== "Admin";
      const deleteBtn = canDelete
        ? `<button type="button" class="btn danger deleteStaffBtn" data-id="${s.id}" data-name="${s.name}">Delete</button>`
        : "";
      return `<tr><td><b>${s.code}</b></td><td>${s.name}</td><td>${s.role}</td><td><span class="pill ${pillClass}">${s.status}</span></td><td>${toggleBtn} ${deleteBtn}</td></tr>`;
    })
    .join("");

  ["issueItem", "receiveItem"].forEach(
    (id) => ($(id).innerHTML = items.map((i) => `<option value="${i.code}">${i.name} (${i.balance} available)</option>`).join(""))
  );

  renderReport();
}
