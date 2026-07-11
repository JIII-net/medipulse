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
    </style></head><body>${bodyHtml}<scr` + `ipt>window.onload = () => window.print();</scr` + `ipt></body></html>`
  );
  w.document.close();
}

// Escapes user-supplied text before it's interpolated into a raw HTML
// print template (document.write). Without this, a diagnosis, remark,
// drug name, or patient name containing HTML/script would execute in
// the print window. Always wrap interpolated dynamic values with this.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
