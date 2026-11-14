/* An eye button inside every password box of the dashboard (sign-in, new password, invitation, account page, API
   keys): tap to show what was typed and check it, tap again to hide it. Added to any password box that appears,
   so forms drawn later get it too. */
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6A17.4 17.4 0 002 12s3.6 7 10 7a10 10 0 005.4-1.6"/></svg>';

function addEye(input) {
  if (input.dataset.eye) return;
  input.dataset.eye = "1";
  const wrap = document.createElement("span");
  wrap.className = "pw";
  input.parentNode.insertBefore(wrap, input);
  wrap.append(input);
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "pw__eye";
  const paint = (shown) => {
    btn.innerHTML = shown ? EYE_OFF : EYE;
    btn.setAttribute("aria-label", shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    btn.setAttribute("aria-pressed", String(shown));
    btn.title = btn.getAttribute("aria-label");
  };
  paint(false);
  input._eyeHide = () => { input.type = "password"; paint(false); };
  btn.onclick = () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    paint(show);
    input.focus({ preventScroll: true });
  };
  wrap.append(btn);
}

export function setupPasswordEyes() {
  const scan = (root) => root.querySelectorAll?.('input[type="password"]:not([data-eye])').forEach(addEye);
  scan(document);
  new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('input[type="password"]') ? addEye(n) : scan(n))); })
    .observe(document.body, { childList: true, subtree: true });
  // a form sent or cleared hides what was shown again
  document.addEventListener("submit", (e) => e.target.querySelectorAll?.("input[data-eye]").forEach((i) => i._eyeHide?.()), true);
}
