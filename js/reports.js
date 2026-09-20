import { $, toast } from "./dom.js";
import { items, activity, total, receivedTotal, session } from "./state.js";
import { isGmailApiConfigured, connectGmail, sendGmail, openGmailCompose, getGmailSender } from "./gmail.js";

const EMAIL_TO_KEY = "edenbiz.reportEmailTo";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reportMeta() {
  const period = $("period").value;
  const who = session.currentUser;
  const sentBy = who ? who.name + " (" + who.staff_code + ")" : "Edenbiz Procure Stores";
  return {
    period,
    title: "Edenbiz Procure - " + period + " Cap Lamp Spares Inventory Report",
    sentBy,
    dateLabel: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    opening: items.reduce((s, i) => s + i.opening, 0),
    received: receivedTotal(),
    issued: activity.filter((a) => a.action === "Issued").reduce((s, a) => s + a.qty, 0),
    closing: total(),
  };
}

function buildHtmlEmail(to) {
  const m = reportMeta();
  const rows = items
    .map(
      (i) =>
        "<tr>" +
        "<td style='padding:8px;border-bottom:1px solid #edf1f5'>" + escapeHtml(i.name) + "</td>" +
        "<td style='padding:8px;border-bottom:1px solid #edf1f5'>" + i.issued + "</td>" +
        "<td style='padding:8px;border-bottom:1px solid #edf1f5'>" + i.balance + "</td>" +
        "</tr>"
    )
    .join("");

  return (
    "<div style='font-family:Arial,sans-serif;color:#172b4d;font-size:14px;line-height:1.5'>" +
    "<p>Dear Supervisor,</p>" +
    "<p>Please find the " +
    escapeHtml(m.period.toLowerCase()) +
    " cap lamp spares inventory summary, sent by " +
    escapeHtml(m.sentBy) +
    " on " +
    escapeHtml(m.dateLabel) +
    ".</p>" +
    "<table style='border-collapse:collapse;margin:16px 0'>" +
    "<tr><td style='padding:6px 16px 6px 0;color:#64748b'>Opening stock</td><td><b>" + m.opening + "</b></td></tr>" +
    "<tr><td style='padding:6px 16px 6px 0;color:#64748b'>Received</td><td><b>" + m.received + "</b></td></tr>" +
    "<tr><td style='padding:6px 16px 6px 0;color:#64748b'>Issued</td><td><b>" + m.issued + "</b></td></tr>" +
    "<tr><td style='padding:6px 16px 6px 0;color:#64748b'>Closing stock</td><td><b>" + m.closing + "</b></td></tr>" +
    "</table>" +
    "<table style='border-collapse:collapse;width:100%;max-width:640px'>" +
    "<thead><tr>" +
    "<th style='text-align:left;padding:8px;background:#f8fafc;color:#64748b;border-bottom:1px solid #edf1f5'>Spare</th>" +
    "<th style='text-align:left;padding:8px;background:#f8fafc;color:#64748b;border-bottom:1px solid #edf1f5'>Issued</th>" +
    "<th style='text-align:left;padding:8px;background:#f8fafc;color:#64748b;border-bottom:1px solid #edf1f5'>Balance</th>" +
    "</tr></thead>" +
    "<tbody>" + (rows || "<tr><td colspan='3' style='padding:8px'>No items on record.</td></tr>") + "</tbody>" +
    "</table>" +
    "<p>Regards,<br>Edenbiz Procure Stores Department</p>" +
    "<p style='color:#64748b;font-size:12px'>This report was sent from Edenbiz Procure to " +
    escapeHtml(to) +
    ".</p>" +
    "</div>"
  );
}

function buildPlainEmail() {
  const m = reportMeta();
  const lines = items.map((i) => i.name + " — issued " + i.issued + ", balance " + i.balance);
  return [
    "Dear Supervisor,",
    "",
    "Please find the " + m.period.toLowerCase() + " cap lamp spares inventory summary.",
    "Sent by " + m.sentBy + " on " + m.dateLabel + ".",
    "",
    "Opening stock: " + m.opening,
    "Received: " + m.received,
    "Issued: " + m.issued,
    "Closing stock: " + m.closing,
    "",
    "Spares:",
    ...(lines.length ? lines : ["(none)"]),
    "",
    "Regards,",
    "Edenbiz Procure Stores Department",
  ].join("\n");
}

function refreshEmailPreview() {
  const to = ($("reportEmailTo")?.value || "").trim() || "(add a recipient above)";
  const m = reportMeta();
  const preview = $("emailPreview");
  if (!preview) return;
  preview.classList.remove("hidden");
  preview.innerHTML =
    "<b>Email that will be sent</b><br><br>" +
    "<b>To:</b> " + escapeHtml(to) + "<br>" +
    "<b>Subject:</b> " + escapeHtml(m.title) + "<br><br>" +
    "Dear Supervisor,<br><br>Please find the " +
    escapeHtml(m.period.toLowerCase()) +
    " cap lamp spares inventory summary. Total issued: " +
    m.issued +
    " units. Current closing stock: " +
    m.closing +
    " units.<br><br>Regards,<br>" +
    escapeHtml(m.sentBy);
}

function updateGmailStatus() {
  const el = $("gmailStatus");
  if (!el) return;
  const sender = getGmailSender();
  if (sender) {
    el.textContent = "Gmail connected as " + sender + ". Send will go from this inbox.";
    return;
  }
  if (isGmailApiConfigured()) {
    el.textContent = "Click Send with Gmail — Google will ask once for permission to send.";
    return;
  }
  el.textContent =
    "Gmail API is not connected yet, so Send will open a Gmail compose window. To send without leaving this page, paste a Google client ID into js/gmail.js (steps are in that file).";
}

export function renderReport() {
  const m = reportMeta();
  $("rOpening").textContent = m.opening;
  $("rReceived").textContent = m.received;
  $("rIssued").textContent = m.issued;
  $("reportTitle").textContent = "Edenbiz Procure – " + m.period + " Cap Lamp Spares Inventory Report";
  const dateEl = $("reportDate");
  if (dateEl) dateEl.textContent = m.dateLabel + " · Live report";
  $("reportTable").innerHTML = items
    .map((i) => "<tr><td>" + escapeHtml(i.name) + "</td><td>" + i.issued + "</td><td>" + i.balance + "</td></tr>")
    .join("");
  refreshEmailPreview();
  updateGmailStatus();
}

export function setupReportEvents() {
  const toInput = $("reportEmailTo");
  if (toInput) {
    const saved = localStorage.getItem(EMAIL_TO_KEY);
    if (saved) toInput.value = saved;
    toInput.addEventListener("input", () => {
      localStorage.setItem(EMAIL_TO_KEY, toInput.value.trim());
      refreshEmailPreview();
    });
  }

  $("period").addEventListener("change", renderReport);

  $("sendEmail").addEventListener("click", async () => {
    const to = ($("reportEmailTo")?.value || "").trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast("Enter a valid supervisor email first.");
      $("reportEmailTo")?.focus();
      return;
    }

    const m = reportMeta();
    const btn = $("sendEmail");
    btn.disabled = true;
    const previousLabel = btn.textContent;
    btn.textContent = "Sending…";

    try {
      if (isGmailApiConfigured()) {
        await sendGmail({ to, subject: m.title, html: buildHtmlEmail(to) });
        toast("Report sent to " + to + (getGmailSender() ? " from " + getGmailSender() : " via Gmail") + ".");
        updateGmailStatus();
      } else {
        openGmailCompose({ to, subject: m.title, body: buildPlainEmail() });
        toast("Opened in Gmail. Click Send there to deliver it.");
        updateGmailStatus();
      }
    } catch (err) {
      if (err.code === "not-configured") {
        openGmailCompose({ to, subject: m.title, body: buildPlainEmail() });
        toast("Opened in Gmail. Click Send there to deliver it.");
      } else {
        toast("Couldn't send: " + (err.message || "Gmail error"));
        console.error(err);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = previousLabel;
    }
  });

  const connectBtn = $("connectGmail");
  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      try {
        const { email } = await connectGmail();
        toast("Gmail connected" + (email ? " as " + email : "") + ".");
        updateGmailStatus();
      } catch (err) {
        if (err.code === "not-configured") {
          toast("Paste a Google client ID into js/gmail.js first — the steps are in that file.");
        } else {
          toast("Couldn't connect Gmail: " + (err.message || "cancelled"));
        }
      }
    });
  }

  $("exportReport").addEventListener("click", () => {
    let rows = [["Spare", "Opening", "Issued", "Balance"], ...items.map((i) => [i.name, i.opening, i.issued, i.balance])];
    let csv = rows.map((r) => r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")).join("\n");
    let blob = new Blob([csv], { type: "text/csv" });
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = "edenbiz-procure-inventory-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV report prepared.");
  });

  updateGmailStatus();
}