// ==========================================================
// gmail.js
// ----------------------------------------------------------
// Sends the inventory report from the signed-in person's REAL
// Gmail, using the Gmail API. Same shape as supabaseClient.js:
// one shared helper, a public client id sitting in this file,
// and the actual "are they allowed to do this?" check happening
// on Google's side (they have to approve a Gmail popup once).
//
// ACTION NEEDED — one-time Google setup, then paste the client
// id into GOOGLE_CLIENT_ID below. Until that's filled in, the
// Send button opens a Gmail compose window instead (still real
// Gmail — you click Send there). After the client id is in,
// Send delivers the email without leaving this page.
//
//   1. Open https://console.cloud.google.com
//   2. Create a project (or pick one) → APIs & Services
//   3. Enable "Gmail API"
//   4. OAuth consent screen → External → add YOUR Gmail as a
//      test user (required while the app is in testing)
//   5. Credentials → Create credentials → OAuth client ID →
//      Application type: Web application
//   6. Under "Authorized JavaScript origins" add the exact
//      origin in your browser bar, with no path. Examples:
//        http://127.0.0.1:5500
//        http://localhost:5500
//        https://your-live-site.com
//   7. Copy the Client ID (ends in .apps.googleusercontent.com)
//      and paste it into GOOGLE_CLIENT_ID below.
//
// The client id is safe to sit in a frontend file — it is not a
// secret. Google will still show a consent popup, and only the
// Gmail of the person who clicks Send can actually send.
// ==========================================================

const GOOGLE_CLIENT_ID = "1004657653842-3e7mbfm1atdjvg0bjgrpj1701me9r6l7.apps.googleusercontent.com";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

let accessToken = null;
let senderEmail = null;

export function isGmailApiConfigured() {
  return (
    typeof GOOGLE_CLIENT_ID === "string" &&
    GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com") &&
    !GOOGLE_CLIENT_ID.startsWith("PASTE_")
  );
}

export function getGmailSender() {
  return senderEmail;
}

function waitForGoogle(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function tick() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("Google sign-in failed to load. Refresh and try again."));
      }
      setTimeout(tick, 50);
    })();
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toBase64Url(str) {
  return utf8ToBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSubject(subject) {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return "=?UTF-8?B?" + utf8ToBase64(subject) + "?=";
}

async function fetchSenderEmail(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

export async function connectGmail() {
  if (!isGmailApiConfigured()) {
    const err = new Error("Gmail API is not configured yet.");
    err.code = "not-configured";
    throw err;
  }

  await waitForGoogle();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GMAIL_SCOPES,
      callback: async (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        accessToken = resp.access_token;
        senderEmail = await fetchSenderEmail(accessToken);
        resolve({ email: senderEmail });
      },
    });
    client.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

export async function sendGmail({ to, subject, html }) {
  if (!accessToken) await connectGmail();

  const mime =
    "To: " + to + "\r\n" +
    "Subject: " + encodeSubject(subject) + "\r\n" +
    "MIME-Version: 1.0\r\n" +
    'Content-Type: text/html; charset="UTF-8"\r\n' +
    "\r\n" +
    html;

  async function post(token) {
    return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: toBase64Url(mime) }),
    });
  }

  let res = await post(accessToken);
  if (res.status === 401) {
    accessToken = null;
    await connectGmail();
    res = await post(accessToken);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gmail refused to send this email.");
  }
  return res.json();
}

export function openGmailCompose({ to, subject, body }) {
  const url =
    "https://mail.google.com/mail/?view=cm&fs=1&tf=1" +
    "&to=" + encodeURIComponent(to) +
    "&su=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(body);
  window.open(url, "_blank", "noopener,noreferrer");
}