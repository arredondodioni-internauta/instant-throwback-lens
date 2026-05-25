## Objetivo
Hacer que el gesto de pinza controle el zoom de la cámara dentro del preview, sin escalar la página, y que la experiencia se sienta más nativa en iPhone.

## Qué voy a cambiar

### 1. Endurecer el bloqueo de zoom del navegador en la pantalla de cámara
Actualizaré la pantalla `src/routes/guest.$eventId.tsx` para bloquear no solo el scroll, sino también los gestos del navegador que iOS Safari todavía puede interpretar como page zoom.

Esto incluye:
- bloquear `gesturestart / gesturechange / gestureend` mientras la cámara está abierta
- interceptar eventos multitouch a nivel documento solo durante esa ruta
- mantener `viewport-fit=cover` y desactivar el escalado de página mientras el usuario está en la cámara
- restaurar todo limpiamente al salir de la pantalla

### 2. Hacer el pinch-to-zoom más parecido a cámara nativa
Reemplazaré la lógica actual de pinch por una implementación más robusta para que el gesto cambie el zoom del lente de forma continua.

Esto incluye:
- usar una referencia estable del zoom actual para evitar cierres obsoletos durante el gesto
- calcular el zoom desde la distancia inicial de los dedos con suavizado continuo
- evitar saltos por re-render mientras la pinza sigue activa
- aplicar el zoom al `MediaStreamTrack` en tiempo real
- priorizar el zoom nativo del track cuando el dispositivo lo soporte

### 3. Mejorar compatibilidad con iPhone/Safari
Agregaré fallback defensivo para los casos donde Safari expone capacidades limitadas o aplica restricciones de forma distinta.

Esto incluye:
- leer y validar capacidades del track antes de aplicar zoom
- reintentar la aplicación de constraints de zoom con un flujo más compatible
- detectar cuando el dispositivo no soporta zoom real y degradar la UI de forma segura
- evitar que la UI muestre un control de zoom “activo” cuando el hardware no lo permite

### 4. Ajustar la experiencia full-screen del visor
Mantendré el visor como experiencia inmersiva real, evitando que cualquier elemento de layout contribuya al page scaling o al scroll accidental.

Esto incluye:
- revisar el shell de la ruta para asegurar que no haya interferencia global con la cámara
- reforzar estilos de touch behavior en el contenedor del visor
- conservar safe areas de iPhone sin sacrificar el área útil del preview

## Archivos a tocar
- `src/routes/guest.$eventId.tsx`
- posiblemente `src/routes/__root.tsx` solo si hace falta endurecer el `meta viewport` global sin romper el resto de la app

## Resultado esperado
- hacer pinch dentro del visor ya no ampliará la webpage
- el gesto controlará el zoom de la cámara cuando el dispositivo lo soporte
- el cambio de zoom se sentirá continuo y estable
- la pantalla de cámara seguirá ocupando todo el viewport sin scroll

## Detalles técnicos
```text
Pinch gesture
  -> calcula distancia entre 2 toques
  -> convierte esa variación en zoom continuo
  -> clamp entre min/max del track
  -> applyConstraints({ advanced: [{ zoom }] })
  -> bloquea gestures del browser mientras la ruta está montada
```

Si el navegador/dispositivo no ofrece zoom nativo del lente, dejaré el comportamiento protegido para que al menos no se haga zoom de página y el control visual no resulte engañoso.