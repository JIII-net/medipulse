/* ---------------------------- print helper ------------------------ */

export function printDocument(title, bodyHtml) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.write(
    `<html><head><title>${title}</title><style>
      body { font-family: Georgia, serif; color: #111; max-width: 700px; margin: 40px auto; line-height: 1.55; }
      h1 { font-size: 20px; letter-spacing: 1px; margin-bottom: 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 24px; }
      .rule { border-top: 2px solid #111; margin: 14px 0 22px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      td { padding: 6px 4px; vertical-align: top; }
      .label { color: #555; width: 160px; }
      .rx-item { margin: 10px 0; padding-left: 14px; border-left: 3px solid #0d9488; }
      .sig { margin-top: 70px; text-align: right; }
      .sig .line { display: inline-block; border-top: 1px solid #111; padding-top: 4px; min-width: 260px; text-align: center; font-size: 13px; }
      .muted { color: #777; font-size: 11px; margin-top: 30px; }
      .letterhead { display: flex; align-items: center; gap: 12px; }
      .letterhead .mark { flex: 0 0 auto; line-height: 0; }
      .letterhead h1 { margin: 0; }
      @media print { body { margin: 0 auto; } }
    </style></head><body>${bodyHtml}<scr` + `ipt>window.onload = () => window.print();</scr` + `ipt></body></html>`
  );
  w.document.close();
}

/* The 4MED mark as plain markup. Printed documents are written into a
   blank window that can't resolve app assets, so the logo has to travel
   with the document rather than being linked. */
const MARK = `
<svg width="38" height="38" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="pl-blue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E63B8"/><stop offset="55%" stop-color="#0E3F82"/><stop offset="100%" stop-color="#0A2C5E"/>
    </linearGradient>
    <linearGradient id="pl-steel" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#C9D6E3"/><stop offset="45%" stop-color="#F3F7FB"/><stop offset="100%" stop-color="#D7E2EC"/>
    </linearGradient>
    <linearGradient id="pl-ring" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#2FA8FF"/><stop offset="100%" stop-color="#7ED4FF"/>
    </linearGradient>
    <clipPath id="pl-clip">
      <path d="M23 4h18a5 5 0 0 1 5 5v9h9a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5h-9v9a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5v-9H9a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5h9V9a5 5 0 0 1 5-5Z"/>
    </clipPath>
  </defs>
  <g clip-path="url(#pl-clip)">
    <rect x="0" y="0" width="64" height="64" fill="url(#pl-blue)"/>
    <path d="M64 0v64H0Z" fill="url(#pl-steel)" opacity="0.96"/>
  </g>
  <circle cx="32" cy="32" r="14.5" fill="none" stroke="url(#pl-ring)" stroke-width="3.2"/>
</svg>`;

// Every printed document opens the same way: mark, clinic name, what the
// document is, then a rule. Call this instead of hand-writing the header
// so the branding only ever lives in one place.
export function letterhead(subtitle) {
  return `
    <div class="letterhead">
      <span class="mark">${MARK}</span>
      <div>
        <h1>4MED CLINIC</h1>
        <div class="sub" style="margin-bottom:0">${esc(subtitle)}</div>
      </div>
    </div>
    <div class="rule"></div>`;
}

// Escapes user-supplied text before it's interpolated into a raw HTML
// print template (document.write). Without this, a diagnosis, remark,
// drug name, or patient name containing HTML/script would execute in
// the print window. Always wrap interpolated dynamic values with this.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
