import { $, toast, promptModal } from "./dom.js";
import { supabase } from "./supabaseClient.js";
import { session, loadInventoryData } from "./state.js";
import { render } from "./inventory.js";
import { refreshAddItemVisibility } from "./items.js";
import { refreshStaffAdminVisibility } from "./staffAdmin.js";

function staffCodeToEmail(code) {
  return code.trim().toLowerCase() + "@edenbiz.internal";
}

async function showAdminButtonIfNeeded() {
  const { data: adminExists, error } = await supabase.rpc("admin_exists");
  if (error) {
    console.error(error);
    return;
  }
  if (!adminExists) {
    $("showAdminSetup").classList.remove("hidden");
  }
}

async function enterApp(userId, opts) {
  opts = opts || {};
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("staff_code, name, role, status")
    .eq("id", userId)
    .single();
  if (error) throw error;

  if (profile.status === "Disabled") {
    await supabase.auth.signOut();
    throw new Error("This account has been disabled. Contact an admin.");
  }

  session.currentUser = profile;
  $("loginPage").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("profile").textContent = "● " + profile.name + " · " + profile.staff_code;
  $("sideUser").textContent = profile.name;
  $("sideCode").textContent = profile.staff_code;
  $("sideRole").textContent = profile.role === "admin" ? "Admin" : "Staff";

  refreshAddItemVisibility();
  refreshStaffAdminVisibility();
  await loadInventoryData();
  await render();
  if (!opts.quiet) toast("Welcome, " + profile.name + ".");
}

async function restoreSessionIfAny() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
    return;
  }
  if (!data.session || !data.session.user) return;

  try {
    await enterApp(data.session.user.id, { quiet: true });
  } catch (err) {
    $("loginError").textContent =
      err.message === "This account has been disabled. Contact an admin."
        ? err.message
        : "Session expired. Please sign in again.";
    console.error(err);
  }
}

export function setupAuthEvents() {
  showAdminButtonIfNeeded();
  restoreSessionIfAny();

  $("changePasswordBtn").addEventListener("click", async () => {
    const newPassword = await promptModal(
      "Choose a new password for your own account. You'll use this next time you sign in.",
      { placeholder: "At least 6 characters", okLabel: "Change Password" }
    );
    if (newPassword === null) return;

    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters.");
      return;
    }

    // Unlike the admin "Reset Password" button (which needs an Edge
    // Function and the secret service role key to touch SOMEONE
    // ELSE's account), this changes the CURRENTLY SIGNED-IN person's
    // own password. Supabase already knows who that is from the
    // active session, so this one line is the whole job — no server
    // function needed.
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast("Couldn't change password: " + error.message);
      return;
    }

    toast("Password changed.");
  });

  $("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    session.currentUser = null;
    refreshAddItemVisibility();
    refreshStaffAdminVisibility();
    $("app").classList.add("hidden");
    $("loginPage").classList.remove("hidden");
    $("loginForm").reset();
    toast("Signed out.");
  });

  $("showAdminSetup").addEventListener("click", () => {
    $("loginError").textContent = "";
    $("signInView").classList.add("hidden");
    $("adminSetupView").classList.remove("hidden");
  });
  $("backToSignIn").addEventListener("click", () => {
    $("loginError").textContent = "";
    $("adminSetupView").classList.add("hidden");
    $("signInView").classList.remove("hidden");
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginError").textContent = "";

    const { data, error } = await supabase.auth.signInWithPassword({
      email: staffCodeToEmail($("loginCode").value),
      password: $("loginPassword").value,
    });
    if (error) {
      $("loginError").textContent = "Invalid staff code or password.";
      return;
    }

    try {
      await enterApp(data.user.id);
    } catch (err) {
      $("loginError").textContent =
        err.message === "This account has been disabled. Contact an admin."
          ? err.message
          : "Signed in, but couldn't load your profile. Contact an admin.";
      console.error(err);
    }
  });

  $("createAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginError").textContent = "";

    const setupKey = $("adminKey").value;
    const name = $("adminName").value;
    const staffCode = $("adminCode").value;
    const password = $("adminPassword").value;

    const { data: fnData, error: fnError } = await supabase.functions.invoke("admin-create-user", {
      body: { staffCode, name, password, role: "admin", setupKey },
    });
    if (fnError || fnData?.error) {
      $("loginError").textContent = fnData?.error || fnError.message || "Something went wrong.";
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: staffCodeToEmail(staffCode),
      password,
    });
    if (error) {
      $("loginError").textContent = "Account created — please sign in below.";
      $("adminSetupView").classList.add("hidden");
      $("signInView").classList.remove("hidden");
      return;
    }

    try {
      await enterApp(data.user.id);
    } catch (err) {
      $("loginError").textContent =
        err.message === "This account has been disabled. Contact an admin."
          ? err.message
          : "Account created, but couldn't load your profile.";
      console.error(err);
    }
  });
}
