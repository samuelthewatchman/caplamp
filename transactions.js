// ==========================================================
// transactions.js
// ----------------------------------------------------------
// Handles the two core stock movements: Issue Spares and
// Receive Stock. Balances only ever change through
// record_transaction() INSIDE the database (see
// inventory_functions.sql) — this file just calls that function,
// then reloads the real data so the screen matches what's now
// true in Supabase.
//
// The Issue form's "Reason / Reference" field and the Receive
// form's "Supplier / Source" and "Delivery reference" fields are
// now actually stored — see supplier_reference_reason.sql, which
// added those columns to transactions and extended
// record_transaction() to accept and save them. They're optional
// on purpose: an Issue never has a supplier, a Receive never has
// an issue "reason", so each transaction row will always have some
// of these fields empty — that's expected, not missing data.
// ==========================================================
import { $, toast, confirmModal } from "./dom.js";
import { items, session, loadInventoryData } from "./state.js";
import { supabase } from "./supabaseClient.js";
import { render } from "./inventory.js";
import { navigate } from "./navigation.js";

// Calls the record_transaction() database function. Returns the
// error (or null on success) rather than throwing, so the two
// handlers below can show a normal toast instead of an uncaught
// exception. `extra` carries whichever of reason/supplier/reference
// actually apply — an Issue passes reason only, a Receive passes
// supplier/reference only, so the other side always ends up null,
// matching the columns' own nullable design.
async function recordTransaction(itemId, action, qty, extra = {}) {
  const { error } = await supabase.rpc("record_transaction", {
    item_id: itemId,
    action,
    qty,
    reason: extra.reason ?? null,
    supplier: extra.supplier ?? null,
    reference: extra.reference ?? null,
  });
  return error;
}

export function setupTransactionEvents() {
  $("issueForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    let i = items.find((x) => x.code === $("issueItem").value);
    let q = Number($("issueQty").value);
    if (!i) return;

    // This check still runs against the balance we last loaded —
    // still worth doing client-side so the person gets instant
    // feedback instead of waiting on a round trip, but the database
    // function re-checks this itself too (see inventory_functions.sql),
    // so someone can't bypass it by editing this file's JS.
    if (q < 1 || q > i.balance) {
      toast("Quantity exceeds available balance.");
      return;
    }

    if (q > i.balance * 0.5) {
      const sure = await confirmModal(
        `You're about to issue ${q} units of ${i.name} — more than half of the ${i.balance} currently in stock. Continue?`,
        "Issue anyway"
      );
      if (!sure) return;
    }

    const reason = $("issueReason").value.trim();
    const error = await recordTransaction(i.id, "Issued", q, { reason: reason || null });
    if (error) {
      toast("Couldn't record issue: " + error.message);
      return;
    }

    await loadInventoryData();
    render();
    e.target.reset();
    toast("Issue recorded under " + session.currentUser.name + ".");
    navigate("dashboard");
  });

  $("receiveForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    let i = items.find((x) => x.code === $("receiveItem").value);
    let q = Number($("receiveQty").value);
    if (!i) return;

    const supplier = $("receiveSupplier").value.trim();
    const reference = $("receiveRef").value.trim();
    const error = await recordTransaction(i.id, "Received", q, {
      supplier: supplier || null,
      reference: reference || null,
    });
    if (error) {
      toast("Couldn't record receipt: " + error.message);
      return;
    }

    await loadInventoryData();
    render();
    e.target.reset();
    toast("Receipt recorded.");
    navigate("dashboard");
  });
}
