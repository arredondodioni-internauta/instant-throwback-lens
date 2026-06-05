/**
 * PRESERVED — NOT IMPORTED ANYWHERE.
 *
 * Código de los 4 sliders de ajuste (Brillo / Contraste / Saturación / Calidez)
 * y del postproceso de la foto a través de un canvas con `ctx.filter`.
 *
 * Se mantiene aquí para poder reintroducirlo en el futuro. Cuando se conecte
 * el proyecto a GitHub se puede mover a una rama dedicada (p. ej.
 * `feature/camera-filters`).
 */
import { useEffect } from "react";

export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export function clampAdj(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100, Math.min(100, Math.round(n)));
}

export function buildFilterString(a: Adjustments): string {
  const b = 1 + a.brightness / 100;
  const c = 1 + a.contrast / 100;
  const s = 1 + a.saturation / 100;
  const sepia = Math.min(1, Math.abs(a.warmth) / 200);
  const hue = a.warmth * 0.25;
  return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

export async function applyFilterToBlob(blob: Blob, filter: string): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    bitmap = null;
  }
  if (bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    (ctx as any).filter = filter;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.95,
      ),
    );
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    (ctx as any).filter = filter;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.95,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AdjustSlider({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onDoubleClick={onReset}
        onClick={(e) => e.preventDefault()}
        className="w-20 shrink-0 text-left text-[11px] uppercase tracking-wider text-white/70 font-mono"
        aria-label={`Restablecer ${label}`}
      >
        {label}
      </button>
      <div className="relative flex-1 h-6 flex items-center">
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-3 w-px bg-white/40" />
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          onDoubleClick={onReset}
          className="w-full accent-primary"
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-mono tabular-nums text-white/60">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

/** Hook preservado: persistía los ajustes en localStorage por eventId. */
export function usePersistedAdjustments(
  eventId: string,
  adj: Adjustments,
  setAdj: (a: Adjustments) => void,
) {
  const key = `reel:adjustments:${eventId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setAdj({
            brightness: clampAdj(parsed.brightness),
            contrast: clampAdj(parsed.contrast),
            saturation: clampAdj(parsed.saturation),
            warmth: clampAdj(parsed.warmth),
          });
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(adj));
    } catch {
      // ignore
    }
  }, [adj, key]);
}