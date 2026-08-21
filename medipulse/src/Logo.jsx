import React from "react";

/* ------------------------------------------------------------------ */
/*  4MED logo — a rounded medical cross split between deep blue and    */
/*  silver, with a luminous ring through the middle.                   */
/*                                                                     */
/*  Drawn as inline SVG rather than loaded from a file so it stays     */
/*  crisp at any size and works inside the printed documents, which    */
/*  are written into a blank window that can't resolve app assets.     */
/*  Every gradient id is suffixed per instance — two logos on one page */
/*  with the same id would make the second one inherit the first.      */
/* ------------------------------------------------------------------ */

export const BRAND = "4MED";

let seq = 0;

export function LogoMark({ size = 32, className = "" }) {
  const uid = React.useMemo(() => `l${++seq}`, []);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="4MED"
    >
      <defs>
        <linearGradient id={`${uid}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E63B8" />
          <stop offset="55%" stopColor="#0E3F82" />
          <stop offset="100%" stopColor="#0A2C5E" />
        </linearGradient>
        <linearGradient id={`${uid}-steel`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#C9D6E3" />
          <stop offset="45%" stopColor="#F3F7FB" />
          <stop offset="100%" stopColor="#D7E2EC" />
        </linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2FA8FF" />
          <stop offset="100%" stopColor="#7ED4FF" />
        </linearGradient>
        {/* The silver half is clipped out of the cross, so both halves
            share one silhouette and can never drift apart. */}
        <clipPath id={`${uid}-clip`}>
          <path d="M23 4h18a5 5 0 0 1 5 5v9h9a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5h-9v9a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5v-9H9a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5h9V9a5 5 0 0 1 5-5Z" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        <rect x="0" y="0" width="64" height="64" fill={`url(#${uid}-blue)`} />
        {/* sweeping silver diagonal, echoing the original artwork */}
        <path d="M64 0v64H0Z" fill={`url(#${uid}-steel)`} opacity="0.96" />
        <path
          d="M-4 44C14 44 26 30 26 12"
          fill="none"
          stroke="#8FB6DC"
          strokeWidth="1"
          opacity="0.5"
        />
      </g>

      <circle cx="32" cy="32" r="14.5" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="3.2" />
    </svg>
  );
}

export function LogoLockup({ size = 30, tone = "light", className = "" }) {
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <LogoMark size={size} />
      <span
        className="font-display font-bold tracking-tight"
        style={{ fontSize: size * 0.6, color: tone === "dark" ? "#0E3F82" : undefined }}
      >
        {BRAND}
      </span>
    </span>
  );
}

/* Markup-only copy for the printed documents, which are built as an
   HTML string in a separate window and can't mount React. */
export const printLogoSvg = (size = 34) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" style="vertical-align:middle">
  <defs>
    <linearGradient id="p-blue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E63B8"/><stop offset="55%" stop-color="#0E3F82"/><stop offset="100%" stop-color="#0A2C5E"/>
    </linearGradient>
    <linearGradient id="p-steel" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#C9D6E3"/><stop offset="45%" stop-color="#F3F7FB"/><stop offset="100%" stop-color="#D7E2EC"/>
    </linearGradient>
    <linearGradient id="p-ring" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#2FA8FF"/><stop offset="100%" stop-color="#7ED4FF"/>
    </linearGradient>
    <clipPath id="p-clip">
      <path d="M23 4h18a5 5 0 0 1 5 5v9h9a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5h-9v9a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5v-9H9a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5h9V9a5 5 0 0 1 5-5Z"/>
    </clipPath>
  </defs>
  <g clip-path="url(#p-clip)">
    <rect x="0" y="0" width="64" height="64" fill="url(#p-blue)"/>
    <path d="M64 0v64H0Z" fill="url(#p-steel)" opacity="0.96"/>
  </g>
  <circle cx="32" cy="32" r="14.5" fill="none" stroke="url(#p-ring)" stroke-width="3.2"/>
</svg>`;
