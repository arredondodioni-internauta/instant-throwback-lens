## Cambios en `src/routes/guest.$eventId.tsx`

### 1. Quitar los filtros de la cámara (mantener zoom)
- Eliminar del JSX el bloque "Always-visible image adjustment sliders" (los 4 sliders `Brillo/Contraste/Saturación/Calidez`).
- Quitar `style={{ filter: filterString }}` del `<video>`.
- Quitar el postproceso del blob: la rama `else if (!filterIsNeutral) applyFilterToBlob(...)` y la línea `if (!filterIsNeutral) ctx.filter = filterString` en el canvas de fallback.
- Eliminar del componente: tipo `Adjustments`, estado `adj`, `ADJ_STORAGE_KEY`, ambos `useEffect` de carga/persistencia en `localStorage`, `filterString`, `filterIsNeutral`.
- Eliminar las funciones auxiliares no usadas en el cuerpo del archivo: `clampAdj`, `buildFilterString`, `applyFilterToBlob`, y el componente `AdjustSlider`.
- El zoom (slider vertical lateral + pinch + capacidades del track) queda **intacto**.

### 2. Preservar el código eliminado en un archivo aparte
Crear `src/lib/camera-filters.unused.ts` que **no se importa en ningún sitio** y contiene:
- El tipo `Adjustments`.
- `clampAdj`, `buildFilterString`, `applyFilterToBlob`.
- El componente `AdjustSlider`.
- Un comentario superior explicando que es código preservado para reintroducir los 4 sliders en el futuro (y que cuando se conecte GitHub se puede mover a una rama).

### 3. Maximizar la imagen y superponer el botón de disparo
Reestructurar el layout del `<main>` para que el visor (video) ocupe toda la pantalla y los controles floten encima:

- `<main>` mantiene `fixed inset-0 h-dvh` pero deja de ser `flex flex-col`. Pasa a ser `relative`.
- El **viewfinder** pasa a ser `absolute inset-0` (ocupa toda la pantalla, no sólo el espacio entre top-bar y controles). El `<video>` sigue con `object-cover`.
- La **top bar** (nombre evento + ISO/f/exposición) se convierte en overlay `absolute top-0 inset-x-0 z-20` con un suave gradiente oscuro de fondo para legibilidad. Mantiene el padding seguro de `env(safe-area-inset-top)`.
- El **slider vertical de zoom** ya es `absolute` dentro del viewfinder; queda igual (lateral derecho centrado).
- El bloque inferior **"film strip + shot counter"** queda donde está (overlay inferior con gradiente), pero se sube ligeramente para hacer hueco al botón.
- Los **controles inferiores** (botón de disparo + flip camera) pasan a ser overlay `absolute bottom-0 inset-x-0 z-20`, con el mismo padding seguro `env(safe-area-inset-bottom)`. El botón de disparo queda **superpuesto sobre la imagen**, no en una franja separada debajo.
- El film strip / contador se reubica encima del botón (por ejemplo, `bottom` mayor) para que no se solape con el shutter.

### Resultado visual

```text
┌──────────────────────────────┐
│ EventName        ISO 400     │ ← overlay top
│ NAME             f/2.8 1/60  │
│                              │
│                              │
│        VISOR (full)       │1.0x│ ← zoom lateral
│        sin filtro         │ ▲ │
│                           │ ║ │
│                           │ ▼ │
│        ●●●○○○○ 03/10         │ ← contador
│              ◯               │ ← shutter superpuesto
│                         ↻    │ ← flip
└──────────────────────────────┘
```

## Fuera de alcance
- No se toca lógica de cámara, captura, zoom, auth, subida ni el flujo de `/join`.
- No se conecta GitHub (se hará más adelante, moviendo `camera-filters.unused.ts` a una rama).
