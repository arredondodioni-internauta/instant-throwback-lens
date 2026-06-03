## Problema
El usuario reporta que no ve el cambio de la barra de zoom (que pasó de 100 px a 220 px de alto). El código ya está actualizado en `src/routes/guest.$eventId.tsx`, así que lo más probable es que el navegador esté mostrando una versión cacheada en el móvil.

## Pasos

1. Pedirle al usuario que haga un "hard refresh" en el móvil (cerrar la pestaña de Safari/Chrome y volver a abrir el enlace, o limpiar caché del sitio). Los Service Workers y el caché de iOS suelen retener la pantalla de cámara anterior.

2. Si tras el refresh aún no se ve más larga, ajustar en `src/routes/guest.$eventId.tsx` el bloque del slider vertical para garantizar visibilidad:
   - Subir la altura del contenedor de `220` a `260` px y el `width` del input a `260` px, para que el cambio sea inequívocamente perceptible.
   - Añadir `z-30` al contenedor del slider para asegurarnos de que no quede tapado por el degradado inferior u otros overlays.
   - Aumentar el área táctil con `py-2 px-1` en el contenedor.

3. No tocar nada más (lógica de cámara, zoom, captura).

## Pregunta para el usuario antes de implementar
¿Probaste cerrando la pestaña y volviendo a abrir el enlace en el iPhone? Si ya lo hiciste y sigue igual, aplico el paso 2 (subirlo a 260 px y asegurar z-index).
