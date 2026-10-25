/* ---------------------------- print helper ------------------------ */

// One stylesheet for every printed document (prescriptions, certificates,
// consent forms, statements and receipts), so the paper matches the app:
// Archivo in navy ink, hairline rules, printed field labels. The fallback
// stack covers a print window that can't reach Google Fonts.
export const PRINT_CSS = `
  @import url("https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap");
  @page { margin: 18mm 16mm; }
  body { font-family: Archivo, "Helvetica Neue", Arial, sans-serif; color: #13305E; max-width: 680px; margin: 36px auto; line-height: 1.5; font-size: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 2px; }
  h2, h3 { font-weight: 700; }
  .sub { color: #46597A; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; font-stretch: 80%; margin-bottom: 22px; }
  .rule { border-top: 2px solid #13305E; border-bottom: 1px solid #13305E; height: 3px; margin: 14px 0 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #46597A; border-bottom: 1px solid #13305E; padding: 6px 4px; }
  td { padding: 7px 4px; vertical-align: top; border-bottom: 1px solid #DDE2E8; }
  .totals td { border-bottom: 0; padding: 3px 4px; }
  .grand td { font-weight: 800; border-top: 2px solid #13305E; }
  .r { text-align: right; }
  .label { color: #46597A; width: 160px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .rx-item { margin: 0; padding: 10px 0 10px 34px; border-bottom: 1px solid #DDE2E8; position: relative; }
  .rx-item::before { content: "Rx"; position: absolute; left: 0; top: 10px; font-weight: 800; font-style: italic; font-size: 13px; }
  .sig { margin-top: 72px; text-align: right; }
  .sig .line { display: inline-block; border-top: 1px solid #13305E; padding-top: 5px; min-width: 260px; text-align: center; font-size: 13px; }
  .muted { color: #566884; font-size: 11px; margin-top: 32px; padding-top: 10px; border-top: 1px dashed #C3CBD6; }
  .letterhead { display: flex; align-items: center; gap: 12px; }
  .letterhead .mark { flex: 0 0 auto; line-height: 0; }
  .letterhead h1 { margin: 0; }
  .letterhead .sub { margin: 2px 0 0; }
  img { max-width: 100%; }
  .stamp { display: inline-block; margin-top: 18px; padding: 5px 14px 4px; border: 3px solid #5B3FA8; outline: 2px solid #5B3FA8; outline-offset: 2px; border-radius: 4px; color: #5B3FA8; font-weight: 800; font-stretch: 70%; font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase; transform: rotate(-6deg); opacity: 0.9; }
  @media print { body { margin: 0 auto; } }
`;

export function printDocument(title, bodyHtml) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  w.document.write(
    `<html><head><title>${title}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}<scr` + `ipt>window.onload = () => setTimeout(() => window.print(), 250);</scr` + `ipt></body></html>`
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
        <h1>4MED Clinic</h1>
        <div class="sub">${esc(subtitle)}</div>
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
