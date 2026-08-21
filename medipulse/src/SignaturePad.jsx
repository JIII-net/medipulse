import React, { useRef, useEffect, useState } from "react";
import { Undo2, Eraser } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Signature pad — pointer events so one implementation covers finger */
/*  on a clinic tablet and mouse on a desktop. Strokes are kept as     */
/*  point arrays rather than baked pixels so Undo can drop the last    */
/*  stroke and redraw.                                                 */
/* ------------------------------------------------------------------ */

export default function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    strokes.current.forEach((pts) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  };

  // Size the backing store to the device pixel ratio so the signature
  // isn't a blurry mess on phones.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = () => {
    const has = strokes.current.some((s) => s.length > 1);
    setEmpty(!has);
    onChange(has ? canvasRef.current.toDataURL("image/png") : null);
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    strokes.current.push([pointFrom(e)]);
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    strokes.current[strokes.current.length - 1].push(pointFrom(e));
    redraw();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    redraw();
    emit();
  };

  const undo = () => { strokes.current.pop(); redraw(); emit(); };
  const clear = () => { strokes.current = []; redraw(); emit(); };

  return (
    <div>
      <div className="relative rounded-2xl border border-slate-600 bg-slate-100 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none block cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-slate-400 font-body">Sign here</span>
          </div>
        )}
        <div className="absolute bottom-2 left-4 right-4 border-t border-slate-400 pointer-events-none" />
      </div>
      {!disabled && (
        <div className="flex gap-3 mt-2">
          <button onClick={undo} disabled={empty} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 disabled:opacity-40">
            <Undo2 size={12} /> Undo
          </button>
          <button onClick={clear} disabled={empty} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 disabled:opacity-40">
            <Eraser size={12} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
