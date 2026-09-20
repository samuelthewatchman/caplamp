// ==========================================================
// items.js
// ----------------------------------------------------------
// The "Add Item" feature — the piece that finally lets an admin
// type in a real spare part instead of the app only ever showing
// the 7 hand-typed demo rows. Split into its own file (rather than
// folded into inventory.js, which only DISPLAYS items) because
// this is a distinct job: creating new rows in the database, and
// it's the one place in the whole app where only Admin accounts
// are allowed to act.
//
// Reminder on why this is actually safe, not just hidden: the
// button below is hidden from Staff accounts in the UI, which is a
// nice touch — but the REAL enforcement is the "Admins can add
// items" policy in inventory_functions.sql, which runs inside the
// database itself. Even if a Staff account somehow triggered this
// code directly from the browser console, Supabase would refuse
// the insert. The UI hiding is just politeness, not the lock.
// ==========================================================
import { $, toast, confirmModal } from "./dom.js";
import { supabase } from "./supabaseClient.js";
import { session, items, loadInventoryData, CATEGORIES } from "./state.js";
import { render } from "./inventory.js";

// Tracks which item is currently being edited, if any. null means
// the form is in "Add Item" mode. Set when an Edit button is
// clicked, cleared after a successful save or Cancel — this is the
// one thing that decides whether submitting the form does an
// INSERT (new item) or an UPDATE (existing one).
let editingItemId = null;

// Fills the category <select> from the single shared list in
// state.js, so this dropdown can never drift out of sync with what
// the database's CHECK constraint actually accepts.
function populateCategoryOptions() {
  $("newItemCategory").innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("");
}

// Puts the form back into "Add Item" mode: clears editingItemId,
// resets the title/button text, and empties every field. Used
// after Cancel, and after a successful add or save.
function resetItemForm() {
  editingItemId = null;
  $("itemFormTitle").textContent = "Add New Item";
  $("addItemSubmitBtn").textContent = "Add Item";
  $("addItemForm").reset();
  $("costHistoryBox").classList.add("hidden");
  $("costHistoryList").textContent = "";
}

// Switches the form into "Edit" mode for one specific item: fills
// every field with that item's current values, and remembers its
// id so the submit handler below knows to UPDATE instead of INSERT.
// Deliberately does NOT touch Balance — that field isn't even on
// this form, since balance is only supposed to change through
// Issue/Receive (record_transaction), never a direct edit.
function openEditForm(item) {
  editingItemId = item.id;
  $("itemFormTitle").textContent = "Edit " + item.name;
  $("addItemSubmitBtn").textContent = "Save Changes";
  $("newItemCode").value = item.code;
  $("newItemName").value = item.name;
  $("newItemCategory").value = item.category;
  $("newItemOpening").value = item.opening;
  $("newItemMin").value = item.min;
  $("newItemCost").value = item.price;
  $("addItemPanel").classList.remove("hidden");
  loadCostHistory(item.id);
}

// Pulls this item's past costs from item_cost_history (see
// cost_history.sql — that's what actually fills this table; this
// function only reads it) and lists them newest first. Each row
// shows what the cost WAS, until it changed, and who changed it —
// the "changed_by" -> profiles link is what gets us the name.
async function loadCostHistory(itemId) {
  $("costHistoryBox").classList.remove("hidden");
  $("costHistoryList").textContent = "Loading…";

  const { data, error } = await supabase
    .from("item_cost_history")
    .select("cost, changed_at, profiles(name)")
    .eq("item_id", itemId)
    .order("changed_at", { ascending: false });

  if (error) {
    $("costHistoryList").textContent = "Couldn't load cost history: " + error.message;
    return;
  }
  if (!data.length) {
    $("costHistoryList").textContent = "No past cost changes — this item's cost has never been edited.";
    return;
  }
  $("costHistoryList").innerHTML = data
    .map((h) => {
      const date = new Date(h.changed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const who = h.profiles?.name ? " · changed by " + h.profiles.name : "";
      return `<div style="padding:4px 0">GH₵ ${Number(h.cost).toLocaleString()} — until ${date}${who}</div>`;
    })
    .join("");
}

// Shows or hides the "+ Add Item" button based on who's signed in
// right now. Called once at startup (button starts hidden either
// way) and again right after login/logout, since that's the only
// moment the answer can actually change.
export function refreshAddItemVisibility() {
  const isAdmin = session.currentUser?.role === "admin";
  $("addItemToggle").classList.toggle("hidden", !isAdmin);
  if (!isAdmin) {
    $("addItemPanel").classList.add("hidden");
    resetItemForm();
  }
}

export function setupItemEvents() {
  populateCategoryOptions();

  $("addItemToggle").addEventListener("click", () => {
    const opening = $("addItemPanel").classList.contains("hidden");
    if (opening) resetItemForm(); // always starts fresh in Add mode, not mid-edit
    $("addItemPanel").classList.toggle("hidden");
  });

  $("cancelAddItem").addEventListener("click", () => {
    $("addItemPanel").classList.add("hidden");
    resetItemForm();
  });

  // Edit buttons are redrawn every render() (they live inside the
  // Inventory Register table, which gets fully rebuilt each time),
  // so a listener attached directly to one of them would vanish on
  // the next redraw. Listening on the table itself instead — which
  // stays in the page the whole time — and checking which button
  // was actually clicked is what makes this keep working no matter
  // how many times the table refreshes.
  document.querySelector("#spares table").addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".editItemBtn");
    if (editBtn) {
      const item = items.find((i) => i.id === editBtn.dataset.id);
      if (item) openEditForm(item);
      return;
    }

    const deleteBtn = e.target.closest(".deleteItemBtn");
    if (!deleteBtn) return;

    const item = items.find((i) => i.id === deleteBtn.dataset.id);
    if (!item) return;

    const sure = await confirmModal(`Delete "${item.name}" (${item.code}) permanently? This can't be undone.`, "Delete");
    if (!sure) return;

    // No RPC needed here, unlike editing — a plain delete is enough
    // because the real protection is the "Admins can delete items"
    // RLS policy (delete_items_policy.sql), not this file.
    const { error } = await supabase.from("items").delete().eq("id", item.id);

    if (error) {
      // Postgres error code 23503 = foreign key violation. This is
      // the EXPECTED outcome when an item has transaction history —
      // transactions.item_id points at it, and the database refuses
      // to delete a row something else still depends on. That's a
      // feature here: it's what stops you from silently losing part
      // of the audit trail. Anything else is a real, unexpected error.
      toast(
        error.code === "23503"
          ? `Can't delete "${item.name}" — it has Issue/Receive history. Edit it instead if it needs changes.`
          : "Couldn't delete item: " + error.message
      );
      return;
    }

    toast(`Deleted "${item.name}".`);
    // If the item being deleted was also open in the edit form,
    // close/reset the form so it isn't left pointing at a row that
    // no longer exists.
    if (editingItemId === item.id) resetItemForm();
    await loadInventoryData();
    render();
  });

  $("addItemForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const opening = Number($("newItemOpening").value);
    const payload = {
      code: $("newItemCode").value.trim().toUpperCase(),
      name: $("newItemName").value.trim(),
      category: $("newItemCategory").value,
      opening_stock: opening,
      min_stock: Number($("newItemMin").value),
      cost: Number($("newItemCost").value),
    };

    let error;
    if (editingItemId) {
      // Editing: goes through the update_item() database function
      // instead of a plain table update. That function is what
      // actually snapshots the OLD cost into item_cost_history
      // before overwriting it — a direct .update() here would
      // silently skip that logging entirely, which is exactly the
      // bug this fixes. Balance is deliberately left out of this
      // call — it's not one of the function's parameters, so it
      // stays whatever Issue/Receive last set it to.
      ({ error } = await supabase.rpc("update_item", {
        item_id: editingItemId,
        new_code: payload.code,
        new_name: payload.name,
        new_category: payload.category,
        new_opening: payload.opening_stock,
        new_min: payload.min_stock,
        new_cost: payload.cost,
      }));
    } else {
      // Adding: a brand-new item's balance starts equal to its
      // opening stock, since nothing's been issued or received
      // against it yet. No history to log — this item has never
      // had a "previous" cost.
      ({ error } = await supabase.from("items").insert({ ...payload, balance: opening }));
    }

    if (error) {
      // A duplicate item code is the most likely real-world error
      // here (items.code is UNIQUE) — surface the database's own
      // message rather than a generic one, since it usually says
      // exactly that.
      toast("Couldn't save item: " + error.message);
      return;
    }

    toast(editingItemId ? "Item updated: " + payload.name : "Item added: " + payload.name);
    $("addItemPanel").classList.add("hidden");
    resetItemForm();
    await loadInventoryData();
    render();
  });
}
