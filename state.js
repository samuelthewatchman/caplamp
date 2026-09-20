// ==========================================================
// state.js
// ----------------------------------------------------------
// This file is the single source of truth for "the data" —
// staff, spare parts, and activity — but it now comes from
// your real Supabase database instead of fake arrays.
//
// Big idea, worth sitting with: `items`, `staff`, and `activity`
// are still exported the exact same way as before (as arrays),
// and every other file (inventory.js, reports.js, etc.) still
// just reads them the exact same way as before. What changed is
// ONLY how these arrays get filled — via loadInventoryData()
// below, which asks Supabase for the real rows and pushes them
// in, instead of them being hand-typed here. This is exactly the
// payoff of splitting the app into files months ago: the "data
// layer" changed completely, and nothing else had to.
//
// Why `items.length = 0; items.push(...)` instead of
// `items = [...]`? Same reason session.currentUser is a property
// on an object rather than its own export (see the comment lower
// down) — reassigning `items` to a brand-new array would break
// every file that imported it, since they'd still be holding a
// reference to the OLD array. Emptying and refilling the SAME
// array keeps every import pointing at the live data.
// ==========================================================
import { supabase } from "./supabaseClient.js";

export let staff = [];
export let items = [];
export let activity = [];

// currentUser CHANGES while the app runs (set on login, cleared on
// logout). Grouped into an object for the same reason described in
// the original version of this file: `session.currentUser = x`
// updates something every importing file can see; reassigning a
// plain exported variable would not.
export const session = {
  currentUser: null,
};

// Small derived value used in a couple of places (inventory totals,
// the report email preview).
export function total() {
  return items.reduce((s, i) => s + i.balance, 0);
}

// How many units were issued TODAY, this rolling week/month, ever
// in total this year, and how many have ever been received in
// total. All computed from the full transaction history (not just
// the trimmed `activity` list below, which only keeps the most
// recent 50 for display) so these numbers stay correct even as the
// log grows past 50 rows. Filled in by loadInventoryData(); exported
// as functions (not plain values) so every file always reads the
// current number, the same pattern as total() above.
//
// "This week" and "this month" are rolling windows — the last 7
// and last 30 days from right now — rather than calendar
// week/month boundaries, since that's the simpler, unambiguous
// definition and doesn't need a "what day does your week start on"
// decision.
let _issuedTodayTotal = 0;
let _issuedThisWeekTotal = 0;
let _issuedThisMonthTotal = 0;
let _issuedThisYearTotal = 0;
let _receivedAllTimeTotal = 0;
export function issuedTodayTotal() {
  return _issuedTodayTotal;
}
export function issuedThisWeekTotal() {
  return _issuedThisWeekTotal;
}
export function issuedThisMonthTotal() {
  return _issuedThisMonthTotal;
}
export function issuedThisYearTotal() {
  return _issuedThisYearTotal;
}
export function receivedTotal() {
  return _receivedAllTimeTotal;
}

// The 7 categories from the project brief. Exported so the "Add
// Item" form (items.js) can build its category dropdown from the
// same single list instead of a second hand-typed copy that could
// drift out of sync with what the database actually accepts.
export const CATEGORIES = [
  "PCBs",
  "Back Covers",
  "Remote Stop Switch",
  "Headpiece with Cable",
  "LED Clusters",
  "Switch Covers",
  "PAD Coils",
];

// ----------------------------------------------------------
// loadInventoryData()
// ----------------------------------------------------------
// Fetches items, staff (profiles), and recent transactions from
// Supabase, and refills the exported arrays above. Call this once
// right after login, and again after every issue/receive/add-item
// action, so the screen always reflects what's really in the
// database rather than what it looked like a few clicks ago.
//
// New idea worth flagging: this runs FOUR queries. Three of them
// (items, profiles, recent transactions-for-display) don't depend
// on each other, so they're fired together with Promise.all —
// that means they all travel over the network at the same time
// instead of one after another, which is faster. The fourth query
// (every transaction ever, used only to compute accurate totals)
// runs after, since it's a bigger pull we don't want blocking the
// other three unnecessarily.
export async function loadInventoryData() {
  const [itemsRes, profilesRes, recentTxRes] = await Promise.all([
    supabase.from("items").select("*").order("name"),
    supabase.from("profiles").select("*").order("name"),
    supabase
      .from("transactions")
      .select("id, action, qty, created_at, reason, supplier, reference, items(name), profiles(name, staff_code)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (recentTxRes.error) throw recentTxRes.error;

  // Full transaction history, item/action/qty/date only (no joins
  // needed here) — used just to compute the "issued" column per
  // item, today's issued total, and the all-time received total.
  const { data: allTx, error: allTxError } = await supabase
    .from("transactions")
    .select("item_id, action, qty, created_at");
  if (allTxError) throw allTxError;

  const issuedByItem = {};
  const now = new Date();
  const todayStr = now.toDateString();
  const weekCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const currentYear = now.getFullYear();
  _issuedTodayTotal = 0;
  _issuedThisWeekTotal = 0;
  _issuedThisMonthTotal = 0;
  _issuedThisYearTotal = 0;
  _receivedAllTimeTotal = 0;
  allTx.forEach((t) => {
    const txDate = new Date(t.created_at);
    if (t.action === "Issued") {
      issuedByItem[t.item_id] = (issuedByItem[t.item_id] || 0) + t.qty;
      if (txDate.toDateString() === todayStr) _issuedTodayTotal += t.qty;
      if (txDate >= weekCutoff) _issuedThisWeekTotal += t.qty;
      if (txDate >= monthCutoff) _issuedThisMonthTotal += t.qty;
      if (txDate.getFullYear() === currentYear) _issuedThisYearTotal += t.qty;
    } else {
      _receivedAllTimeTotal += t.qty;
    }
  });

  items.length = 0;
  itemsRes.data.forEach((i) =>
    items.push({
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      opening: i.opening_stock,
      balance: i.balance,
      min: i.min_stock,
      price: Number(i.cost),
      issued: issuedByItem[i.id] || 0,
    })
  );

  staff.length = 0;
  profilesRes.data.forEach((p) =>
    staff.push({
      id: p.id,
      code: p.staff_code,
      name: p.name,
      role: p.role === "admin" ? "Admin" : "Staff",
      status: p.status,
    })
  );

  // Recent transactions come back newest-first (for the query's own
  // sake — LIMIT 50 needs to grab the most recent rows). But
  // inventory.js's render() does `.slice(-8).reverse()` to show the
  // newest 8 at the top, which expects the array itself to be
  // OLDEST-first (same shape the old hand-typed demo array was in).
  // Reversing once here keeps that downstream code unchanged.
  activity.length = 0;
  recentTxRes.data
    .slice()
    .reverse()
    .forEach((t) => {
      // One combined "Details" string per row: an Issue only ever
      // has a reason, a Receive only ever has supplier/reference —
      // whichever the other action left null just doesn't show.
      // An em dash means genuinely nothing was entered at the time.
      const details =
        t.action === "Issued"
          ? t.reason || "—"
          : [t.supplier, t.reference].filter(Boolean).join(" · ") || "—";

      activity.push({
        date: new Date(t.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        name: t.items?.name || "Unknown item",
        action: t.action,
        qty: t.qty,
        staff: (t.profiles?.name || "Unknown") + " (" + (t.profiles?.staff_code || "?") + ")",
        details,
      });
    });
}
