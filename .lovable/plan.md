## Objetivo
Que el invitado pueda ajustar de forma intuitiva **brillo, contraste, saturación y calidez** mientras encuadra la foto. Los 4 sliders están **siempre visibles** en la parte inferior desde que se abre la cámara — sin presets, sin botón "Ajustes", sin paneles que abrir.

## Cómo se verá

En la cámara, justo debajo del visor y encima del botón de disparo, una fila fija con **4 sliders horizontales compactos** etiquetados en español:

- **Brillo** (−100 … +100, centro 0)
- **Contraste** (−100 … +100, centro 0)
- **Saturación** (−100 … +100, centro 0)
- **Calidez** (−100 … +100, frío ↔ cálido)

Cada slider:
- Es delgado, ocupa todo el ancho disponible.
- Tiene una etiqueta corta a la izquierda (ej. "Brillo").
- Tiene una marca central visible (el "0" neutro) para que sea evidente dónde está el ajuste por defecto.
- Doble-tap en la etiqueta → resetea ese parámetro a 0.

```text
┌──────────────────────────────┐
│        VISOR (vídeo)         │
│       (con filtro vivo)      │
│                              │
│   ●●●●○○○○  03 / 10          │
├──────────────────────────────┤
│ Brillo      ──────●──────    │
│ Contraste   ──────●──────    │
│ Saturación  ──────●──────    │
│ Calidez     ──────●──────    │
├──────────────────────────────┤
│          ◯ disparo    ↻      │
└──────────────────────────────┘
```

El visor se reduce un poco verticalmente para dejar sitio fijo a los 4 sliders. Nada que abrir, nada que descubrir.

## Cómo funciona técnicamente

1. **Vista previa en vivo (CSS filter sobre el `<video>`)**
   - brillo → `brightness(1 + v/100)`
   - contraste → `contrast(1 + v/100)`
   - saturación → `saturate(1 + v/100)`
   - calidez → combinación de `sepia()` + `hue-rotate()` para empujar hacia ámbar (positivo) o azul (negativo). Es la aproximación CSS estándar a temperatura de color.
   El string se recalcula con `useMemo` cada vez que cambia un slider.

2. **Misma transformación aplicada a la foto final**
   En `shoot()`, tras obtener el blob a máxima resolución (vía `ImageCapture` o canvas):
   - Cargo el blob en un `ImageBitmap`.
   - Lo dibujo en un canvas del mismo tamaño con `ctx.filter = <mismo string>` antes del `drawImage`.
   - Reexporto con `canvas.toBlob('image/jpeg', 0.95)`.
   - Si los 4 ajustes están en 0 → me salto este paso para no perder calidad.

3. **Estado y persistencia**
   - `adjustments = { brightness, contrast, saturation, warmth }` en estado.
   - Se persiste en `localStorage` (`reel:adjustments:${eventId}`) para que entre fotos no haya que reajustar.

4. **No toco** la lógica de cámara, zoom, captura base, autenticación ni el upload — sólo añado el filtro visual y el postproceso del blob cuando hay ajustes activos.

## Archivos a modificar
- `src/routes/guest.$eventId.tsx` — única edición: añadir estado de ajustes, fila de 4 sliders siempre visibles, aplicar filtro CSS al `<video>`, y postprocesar el blob en `shoot()`.

## Fuera de alcance
- Presets / filtros prefabricados.
- LUTs o filtros con WebGL.
- Edición posterior de fotos ya tomadas.
