## Problema
El pinch sigue ampliando la página por dos motivos:

1. El bloqueo de page-zoom se aplica tarde desde un `useEffect` en la ruta de cámara. En iPhone Safari el comportamiento de pinch del navegador suele decidirse desde el viewport inicial del documento, así que cambiarlo después de navegar no es confiable.
2. Aunque el gesto llegue al visor, el `MediaStreamTrack` solo puede hacer zoom real si el navegador expone `capabilities.zoom`. En iOS y en algunos Android esto no siempre existe, así que el gesto parece "no hacer nada" dentro de la cámara.

## Plan

### 1. Endurecer la prevención de page-zoom desde el shell raíz
Actualizaré `src/routes/__root.tsx` para que el viewport del documento ya salga preparado para una experiencia app-like en móvil, con `viewport-fit=cover` y configuración compatible para que iPhone y Android no interpreten el pinch como zoom del navegador.

### 2. Activar un "camera mode" global cuando la ruta de cámara esté abierta
En `src/routes/guest.$eventId.tsx` mantendré el bloqueo de gestos del navegador mientras la cámara esté montada, reforzando overscroll, scroll accidental y gestos multitouch a nivel documento, y limpiando todo al salir.

### 3. Reforzar el pinch-to-zoom dentro del visor
Haré el gesto más estable:
- refs estables para zoom actual y track activo
- cálculo continuo desde la distancia inicial de los dedos
- aplicación directa al track en tiempo real cuando hay soporte nativo
- prevención de scroll/page-zoom durante todo el gesto

### 4. Fallback honesto cuando no hay zoom nativo
Si el dispositivo/navegador no expone `zoom` en `MediaTrackCapabilities` (frecuente en iPhone y en algunos Android):
- ocultar/desactivar la UI de zoom nativo
- igualmente bloquear el page-zoom para que el encuadre no se rompa
- preferir cambiar de cámara (frontal/trasera) cuando ayude, sin fingir un zoom inexistente

### 5. Validar iPhone y Android
Comprobaré que el resultado cumpla en ambos:
- pinch dentro de la cámara nunca amplía la webpage
- el visor ocupa toda la pantalla útil sin scroll
- si hay soporte nativo de zoom, el gesto controla el lente dentro del preview
- si no hay soporte nativo, el gesto deja de sentirse roto y no interfiere con la captura

## Archivos a tocar
- `src/routes/__root.tsx`
- `src/routes/guest.$eventId.tsx`
- posiblemente `src/styles.css` para reglas globales de touch/overscroll en mobile fullscreen

## Detalles técnicos
```text
Root viewport
  -> fija viewport-fit=cover y reglas compatibles con iPhone/Android

Guest camera route mounted
  -> activa camera-mode global
  -> bloquea page gestures / overscroll
  -> monta pinch handlers solo sobre el visor

If track.getCapabilities().zoom exists
  -> applyConstraints({ advanced: [{ zoom }] })
Else
  -> no fake native zoom UI
  -> page zoom sigue bloqueado para no romper el encuadre
```

## Resultado esperado
- En iPhone y Android el pinch deja de ampliar la página.
- Donde haya soporte real de zoom del track, el gesto controla la cámara.
- Donde no lo haya, la app sigue siendo usable y no parece averiada.