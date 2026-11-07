/* Where did this visitor come from? Kept on the device (first visit wins, for 60 days) and sent with the contact form
   and the chat, so the dashboard can show which channels bring customers. No cookies, nothing sent on its own. */
const KEY = "wixa-src";
const NAMES = [[/google\./, "Google"], [/bing\./, "Bing"], [/instagram\./, "Instagram"], [/(facebook|fb)\.(com|me)|m\.facebook/, "Facebook"], [/(^|\.)t\.co$|twitter\.|(^|\.)x\.com/, "X"],
  [/tiktok\./, "TikTok"], [/linkedin\./, "LinkedIn"], [/whatsapp\.|wa\.me/, "WhatsApp"], [/t\.me|telegram\./, "Telegram"], [/snapchat\./, "Snapchat"], [/youtube\.|youtu\.be/, "YouTube"]];
function detect() {
  const q = new URLSearchParams(location.search);
  const utm = q.get("utm_source") || q.get("ref") || q.get("src");
  if (utm) return utm.slice(0, 40);
  if (q.has("gclid")) return "Google Ads";
  if (q.has("fbclid")) return "Facebook";
  if (q.has("ttclid")) return "TikTok Ads";
  let host = "";
  try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch {}
  if (!host || host === location.hostname.replace(/^www\./, "") || host.endsWith("wixa.dev")) return "";
  return (NAMES.find(([re]) => re.test(host)) || [0, host])[1];
}
export function visitSource() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && Date.now() - saved.at < 60 * 864e5) return saved.src;
    const src = detect() || "مباشر";
    localStorage.setItem(KEY, JSON.stringify({ src, at: Date.now() }));
    return src;
  } catch { return detect() || "مباشر"; }
}
