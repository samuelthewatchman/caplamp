// ==========================================================
// staffAdmin.js
// ----------------------------------------------------------
// Lets an ADMIN create a new Staff account from inside the app,
// instead of the only account-creation path being the one-time
// "Admin setup" screen on the sign-in page. This is what closes
// the real gap flagged earlier: before this, you were the only
// person who could ever sign in.
//
// Deliberately staff-only: creating another ADMIN still goes
// through the separate admin-key flow on the sign-in screen — kept
// that way on purpose, so the more powerful action (an account that
// can add/edit items and create other accounts) stays on the more
// guarded path, not this everyday button.
//
// Why this needs a NEW Edge Function (admin-create-staff) instead
// of a plain database insert like items.js does: creating a real
// login account needs Supabase's Admin API and the service role
// key — the same reason admin-create-user needed one. That key can
// never reach the browser, so account creation has to run
// server-side. The function checks, on the server, that whoever is
// calling it is really an admin — never trust a check that only
// happens in this file, since anyone could open dev tools and call
// this function directly, skipping this UI entirely.
// ==========================================================
import { $, toast, confirmModal, promptModal } from "./dom.js";
import { supabase } from "./supabaseClient.js";
import { session, loadInventoryData } from "./state.js";
import { render } from "./inventory.js";

function staffEl(id) {
  return document.getElementById(id);
}

function showAddStaffPanel() {
  const panel = staffEl("addStaffPanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  staffEl("newStaffCode")?.focus();
}

function hideAddStaffPanel() {
  staffEl("addStaffPanel")?.classList.add("hidden");
  staffEl("addStaffForm")?.reset();
}

// Shows or hides the "+ Add Staff" button based on who's signed in
// right now. Called once at startup (starts hidden either way) and
// again right after login/logout, since that's the only moment the
// answer can actually change.
export function refreshStaffAdminVisibility() {
  const isAdmin = session.currentUser?.role === "admin";
  const toggle = staffEl("addStaffToggle") || $("addStaffToggle");
  toggle?.classList.toggle("hidden", !isAdmin);
  staffEl("resetAllDataBtn")?.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) hideAddStaffPanel();
}

export function setupStaffAdminEvents() {
  const staffPage = staffEl("staff");
  if (!staffPage) return;
  // Calling this twice used to attach two toggle listeners. One click
  // then showed the form and immediately hid it again — looks exactly
  // like "the button does nothing", with no console error.
  if (staffPage.dataset.adminEvents === "bound") return;
  staffPage.dataset.adminEvents = "bound";

  // Delegate from the page section so a later innerHTML redraw of the
  // header cannot drop the listener. "+ Add Staff" always OPENS the
  // form; Cancel closes it. stopPropagation so a document-level
  // "click outside to close" handler cannot re-hide it on the same click.
  staffPage.addEventListener("click", async (e) => {
    if (e.target.closest("#addStaffToggle")) {
      e.preventDefault();
      e.stopPropagation();
      showAddStaffPanel();
      return;
    }

    if (e.target.closest("#cancelAddStaff")) {
      e.preventDefault();
      e.stopPropagation();
      hideAddStaffPanel();
      return;
    }

    const deleteBtn = e.target.closest(".deleteStaffBtn");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const staffId = deleteBtn.dataset.id;
      const name = deleteBtn.dataset.name;

      const sure = await confirmModal(
        `Permanently delete ${name}'s account? This removes their login entirely and can't be undone.\n\nIf you just want to block their access for now, use Disable instead.`,
        "Delete"
      );
      if (!sure) return;

      // Unlike Disable (a plain table update above), deleting a
      // login has to go through an Edge Function with the service
      // role key — the same reason admin-create-staff needed one.
      // A plain `.delete()` on profiles here would only remove the
      // directory row and leave the actual login still able to
      // sign in, which is worse than doing nothing.
      const { data, error } = await supabase.functions.invoke("admin-delete-staff", {
        body: { staffId },
      });
      if (error || data?.error) {
        toast("Couldn't delete account: " + (data?.error || error.message));
        return;
      }

      toast(`Deleted ${name}'s account.`);
      await loadInventoryData();
      render();
      return;
    }

    const resetPasswordBtn = e.target.closest(".resetPasswordBtn");
    if (resetPasswordBtn) {
      e.preventDefault();
      e.stopPropagation();
      const staffId = resetPasswordBtn.dataset.id;
      const name = resetPasswordBtn.dataset.name;

      // promptModal shows the shared popup with a text box in it and
      // gives back whatever was typed, or null if Cancel was clicked.
      // We check for null FIRST — before checking the password length —
      // so clicking Cancel just quietly does nothing, instead of
      // showing a confusing "too short" error on an empty cancel.
      const newPassword = await promptModal(
        `Set a new temporary password for ${name}. Tell them the new password directly — it won't be shown again after this.`,
        { placeholder: "At least 6 characters", okLabel: "Reset Password" }
      );
      if (newPassword === null) return;

      if (newPassword.length < 6) {
        toast("Password must be at least 6 characters.");
        return;
      }

      // Same reason admin-create-staff and admin-delete-staff need
      // their own Edge Function: changing someone ELSE's password
      // requires Supabase's Admin API and the service role key, which
      // can never reach the browser. This calls a new Edge Function,
      // admin-reset-password, that we still need to write and deploy —
      // this button will show a "not found" error until that exists.
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { staffId, password: newPassword },
      });
      if (error || data?.error) {
        toast("Couldn't reset password: " + (data?.error || error.message));
        return;
      }

      toast(`Password reset for ${name}.`);
      return;
    }

    if (e.target.closest("#resetAllDataBtn")) {
      e.preventDefault();
      e.stopPropagation();

      // A plain confirm() is enough for the single-row deletes
      // above, but this one action wipes the whole database — it
      // deserves a step that can't be fat-fingered by hitting Enter
      // or double-clicking. Requiring the exact word "RESET" to be
      // typed is that step.
      const typed = await promptModal(
        "This permanently deletes every item, every transaction, and every staff account except your own. This cannot be undone.\n\nType RESET to confirm:",
        { placeholder: "RESET", okLabel: "Reset All Data" }
      );
      if (typed !== "RESET") {
        if (typed !== null) toast("Reset cancelled — you must type RESET exactly.");
        return;
      }

      const resetBtn = staffEl("resetAllDataBtn");
      resetBtn.disabled = true;
      const originalLabel = resetBtn.textContent;
      resetBtn.textContent = "Resetting…";

      // Same reason staff creation/deletion needs an Edge Function:
      // wiping every profile means deleting auth.users rows too,
      // which only the service role key can do, and that key can
      // never reach the browser. The function also re-checks the
      // literal "RESET" confirmation server-side — never trust a
      // check that only happens in this file.
      const { data, error } = await supabase.functions.invoke("admin-reset-data", {
        body: { confirm: "RESET" },
      });

      resetBtn.disabled = false;
      resetBtn.textContent = originalLabel;

      if (error || data?.error) {
        toast("Couldn't reset data: " + (data?.error || error.message));
        return;
      }

      toast("All test data cleared. Starting fresh.");
      await loadInventoryData();
      render();
      return;
    }

    const btn = e.target.closest(".toggleStaffBtn");
    if (!btn) return;

    const newStatus = btn.dataset.next;
    // Plain update, not an RPC function — unlike creating an
    // account, changing an existing row's status doesn't need the
    // service role key at all. It just needs the "Admins can
    // update profiles" RLS policy (disable_staff_accounts.sql) to
    // allow it, the same way "Admins can edit items" already
    // allows item edits without a special function.
    const { error } = await supabase.from("profiles").update({ status: newStatus }).eq("id", btn.dataset.id);
    if (error) {
      toast("Couldn't update account: " + error.message);
      return;
    }

    toast(newStatus === "Disabled" ? "Account disabled." : "Account re-enabled.");
    await loadInventoryData();
    render();
  });

  staffEl("addStaffForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const staffCode = staffEl("newStaffCode").value.trim();
    const name = staffEl("newStaffName").value.trim();
    const password = staffEl("newStaffPassword").value;

    // supabase.functions.invoke automatically attaches the
    // signed-in admin's own access token as the Authorization
    // header — that's what the Edge Function checks server-side to
    // confirm the caller is really an admin. This file never needs
    // to attach it manually.
    const { data, error } = await supabase.functions.invoke("admin-create-staff", {
      body: { staffCode, name, password },
    });

    if (error || data?.error) {
      toast("Couldn't create account: " + (data?.error || error.message));
      return;
    }

    toast("Staff account created: " + name);
    hideAddStaffPanel();
    await loadInventoryData();
    render();
  });
}
