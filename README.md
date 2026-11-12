# Trebolium

Programa local de contabilidad para Los Tréboles SRL. La pantalla inicial reúne el árbol de cuentas y los nueve accesos contables de las capturas de referencia.

## Abrir en Visual Studio Code

1. Abrí la carpeta `trebolium` desde **Archivo → Abrir carpeta**.
2. Con Node.js 20 o posterior, abrí **Terminal → Nueva terminal** y ejecutá:

   ```powershell
   npm start
   ```

3. Entrá a [Trebolium local](http://127.0.0.1:4173). Para detenerlo, usá `Ctrl+C` en la terminal.

El proyecto funciona con las bibliotecas incluidas en Node.js y con los archivos del navegador. Si el puerto está ocupado, ejecutá `$env:TREBOLIUM_PORT = '4174'; npm start` y abrí el puerto 4174.

## Qué incluye

- Plan de cuentas jerárquico con búsqueda y alta, edición y baja de cuentas. Los grupos organizan las cuentas imputables.
- Asientos manuales con validación de partida doble. Los modelos guardan líneas reutilizables.
- Libro diario, libro mayor, balance de sumas y saldos y estado de resultados. Los informes trabajan en pesos argentinos y se exportan a CSV.
- Cierre con previsualización de resultados, patrimonio y apertura. El último cierre se puede eliminar junto con su apertura. La fecha de cierre bloquea cambios en el período anterior.
- Ajuste por inflación con carga de importes ya calculados, historial de índices cargados manualmente, previsualización y exportación de la hoja. La registración usa los importes de la hoja de trabajo.

## Datos y código

La primera modificación crea `data/trebolium.json`. Para respaldar o trasladar el espacio local, detené el servidor y copiá esa carpeta junto con el proyecto. Ejecutá una sola instancia por carpeta de datos.

`server.mjs` valida y guarda operaciones. `chart.mjs` contiene el catálogo inicial. `ledger.mjs` comparte los cálculos de saldos y cierre con la interfaz en `public/`.

La edición actual está pensada para un solo usuario local y una empresa. Para uso compartido y contabilidad oficial quedan pendientes autenticación, auditoría, validación profesional del circuito y automatización de índices y del cálculo de inflación. Los reportes parten de los asientos registrados en ARS. El estado de resultados no incluye un filtro de cotizaciones.

Las guías de Contabilium sobre [cierre contable](https://ayuda.contabilium.com/hc/es/articles/360041082334--C%C3%B3mo-hago-un-asiento-de-cierre-contable) y [ajuste por inflación](https://ayuda.contabilium.com/hc/es/articles/360040820914--C%C3%B3mo-genero-un-ajuste-por-inflaci%C3%B3n) se usaron como referencia de navegación y flujo.
