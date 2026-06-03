## Goal
Alargar la barra vertical de zoom en la pantalla de cámara para que sea más fácil ajustar el zoom con precisión.

## Problem
La barra de zoom actual tiene un contenedor de solo 100 px de alto, por lo que un pequeño movimiento cambia mucho el nivel de zoom.

## Change
In `src/routes/guest.$eventId.tsx`, increase the zoom slider container height from `100` to `220` px and increase the input width from `100` to `220` px so the slider track is more than twice as long, giving finer control.

No other behavior changes.