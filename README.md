# Trebolium

Programa local de contabilidad para Los Tréboles SRL. La pantalla inicial reúne el árbol de cuentas y los nueve accesos contables de las capturas de referencia.

## Abrir en Visual Studio Code

1. Abrí la carpeta `trebolium` desde **Archivo → Abrir carpeta**.
2. Con Node.js 20 o posterior, abrí **Terminal → Nueva terminal** y ejecutá:

   ```powershell
   npm start
   ```

3. Entrá a [Trebolium local](http://127.0.0.1:4173). Para detenerlo, usá `Ctrl+C` en la terminal.

El modo local y la demo se pueden iniciar con Node.js. Si el puerto está ocupado, ejecutá `$env:TREBOLIUM_PORT = '4174'; npm start` y abrí el puerto 4174. El piloto usa el cliente PostgreSQL incluido en las dependencias del proyecto.

## Probar y publicar la demo

Ejecutá `npm run demo` y abrí [Trebolium local](http://127.0.0.1:4173). El Libro diario arranca con tres asientos ficticios y hay un modelo listo para reutilizar. Cada navegador recibe su propia sesión temporal. El botón **Restablecer demo** recupera los ejemplos y borra los cambios de esa sesión.

Cuando el commit con `render.yaml` esté en GitHub, usá el botón para desplegar la demo en el plan Free. Si Render te pide conectar GitHub, elegí el repositorio `JuanpDiaz02/trebolium`. Revisá el servicio **trebolium-demo** y confirmá el despliegue. Compartí la URL HTTPS que Render muestre cuando el servicio esté activo.

[![Desplegar en Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FJuanpDiaz02%2Ftrebolium)

La demo funciona con datos ficticios en memoria. Los cambios se pierden al vencer la sesión o reiniciarse el servicio. El plan Free puede tardar en responder al volver de un período de inactividad. [Límites del plan Free](https://render.com/docs/free)

## Qué incluye

- Plan de cuentas jerárquico con búsqueda y alta, edición y baja de cuentas. Los grupos organizan las cuentas imputables.
- Asientos manuales con validación de partida doble. Los modelos guardan líneas reutilizables.
- Libro diario, libro mayor, balance de sumas y saldos y estado de resultados. Los informes trabajan en pesos argentinos y se exportan a CSV.
- Cierre con previsualización de resultados, patrimonio y apertura. El último cierre se puede eliminar junto con su apertura. La fecha de cierre bloquea cambios en el período anterior.
- Ajuste por inflación con carga de importes ya calculados, historial de índices cargados manualmente, previsualización y exportación de la hoja. La registración usa los importes de la hoja de trabajo.

## Piloto interno

El piloto arranca con el plan de cuentas y los libros vacíos en PostgreSQL. Cada persona entra con su propia cuenta. **Consulta** puede ver y exportar informes. **Operador** puede registrar y corregir movimientos. **Administrador** también puede generar o eliminar cierres, invitar y desactivar usuarios, y consultar los últimos 100 cambios. Cada modificación del libro y su registro de auditoría se guardan en la misma transacción.

### Puesta en marcha

Para una prueba local, prepará una base PostgreSQL vacía, ejecutá `npm ci` y definí `DATABASE_URL`, `TREBOLIUM_ADMIN_EMAIL` y `TREBOLIUM_BOOTSTRAP_TOKEN` antes de ejecutar `npm run pilot`. El token debe ser aleatorio, de 32 bytes codificados como Base64 URL. En PowerShell, este comando lo copia al portapapeles:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))" | Set-Clipboard
```

En Render, elegí `render.pilot.yaml` como ruta del Blueprint del piloto. El plan propuesto crea un servicio Node y una base PostgreSQL pagos, con conexión interna y acceso al sitio por HTTPS. Cargá el correo y el token inicial en Render al revisar el Blueprint. El archivo `render.yaml` corresponde a la demo.

Abrí la URL del piloto con `#invitacion=` seguido del token. Usá el correo configurado y creá la contraseña de la primera cuenta Administrador. La activación inicial funciona únicamente mientras la base no tenga usuarios. Quitá las dos variables de activación después de crear la cuenta. Desde **Equipo y auditoría**, generá las invitaciones para el resto del equipo.

### Validación con el equipo contable

1. Ensayá el acceso con una cuenta de cada rol y usá datos ficticios hasta verificar que las cuentas de consulta no puedan editar y que solo un administrador pueda cerrar un período.
2. Generá un respaldo en Render y restauralo en una base aparte. Verificá el plan de cuentas, los movimientos, el cierre y su auditoría antes de incorporar datos reales. [Copias y recuperación de PostgreSQL](https://render.com/docs/postgresql-backups)
3. Elegí un período ya cerrado. Cargá sus saldos iniciales y asientos, y compará el Diario, el Mayor, el balance y el estado de resultados con los registros actuales junto con quien lleva la contabilidad. Acordá el saldo inicial y la fecha de corte antes de usar el período en curso.

## Datos y código

La primera modificación crea `data/trebolium.json`. Para respaldar o trasladar el espacio local, detené el servidor y copiá esa carpeta junto con el proyecto. Ejecutá una sola instancia por carpeta de datos.

`server.mjs` valida y guarda operaciones. `chart.mjs` contiene el catálogo inicial. `ledger.mjs` comparte los cálculos de saldos y cierre con la interfaz en `public/`.

El modo local está pensado para un solo usuario y una empresa. El piloto permite acceso compartido para una empresa. Quedan pendientes la validación profesional del circuito y la automatización de índices y del cálculo de inflación. Los reportes parten de los asientos registrados en ARS. El estado de resultados no incluye un filtro de cotizaciones.

Las guías de Contabilium sobre [cierre contable](https://ayuda.contabilium.com/hc/es/articles/360041082334--C%C3%B3mo-hago-un-asiento-de-cierre-contable) y [ajuste por inflación](https://ayuda.contabilium.com/hc/es/articles/360040820914--C%C3%B3mo-genero-un-ajuste-por-inflaci%C3%B3n) se usaron como referencia de navegación y flujo.
