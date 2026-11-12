# DC Marketing · Rastreo de pedidos de Temu

Proyecto de DC Marketing (Aguadulce, Coclé, Panamá). El negocio hace pedidos de Temu por encargo para clientes (no vende en Temu). Este repo tiene dos apps web conectadas a una **base de datos compartida en Supabase** (proyecto `dc-rastreo`, id `jmfyzohwffylzrwkbtwl`, organización DicynMarketing, región us-east-1).

Habla siempre en español con el dueño. Escribe para alguien que no es programador: explica en lenguaje simple qué cambió y qué tiene que hacer él.

**Siempre, al inicio de cada respuesta al dueño, pon los links de las apps** (para abrirlas o instalarlas):

- App del cliente: https://dicynmarketing.github.io/dc-rastreo/cliente/
- Panel (Diego y Cinthya): https://dicynmarketing.github.io/dc-rastreo/panel/

Cuando él pide correcciones, publícalas tú en GitHub: abre el pull request a `main` y únelo. No le pidas que lo haga él.

## Estructura

```
index.html           Raíz: redirige a cliente/ (conserva el #código)
panel/index.html     Centro de Envíos: app interna para Diego y Cinthya (oscura, de trabajo)
cliente/index.html   Mi Pedido DC: lo que ve el cliente con su código (clara, visual)
assets/              Logo 160 px (dc-logo-160.png) e íconos de la app instalable (icon-192/512, apple-touch-icon)
*/manifest.webmanifest  Para instalar cada app en el teléfono
.nojekyll            Para que GitHub Pages sirva los archivos tal cual
```

Cada app es un solo archivo HTML con su CSS y JS dentro. El logo también va embebido en base64 dentro de cada HTML (`const LOGO=...`).

## Equipo

| Persona | WhatsApp | Rol |
|---|---|---|
| Diego | 6867-3410 (+507 68673410) | Registra pedidos y atiende a sus clientes |
| Cinthya | 6262-7310 (+507 62627310) | Registra pedidos y atiende a sus clientes |

- Cada cliente tiene asignado quién lo atiende. Los avisos salen desde el WhatsApp de esa persona.
- El tablero (Inicio, Clientes, Ganancias) muestra los números del **equipo junto**. Lo que cambia por persona es "Por hacer": avisos, atascados y compras de sus propios clientes.

## Cómo trabajan (reglas del negocio)

1. **El número de pedido de Temu es la base.** Es único. Dentro de un pedido de Temu van varios clientes (5, 7 o más).
2. Al registrar, primero se pone **lo que pidió cada cliente**: cada artículo con su costo en Temu y lo que se le cobra. Después se pone el **número de pedido de Temu** y el **número de guía**. La guía puede quedar vacía y agregarse después.
3. Si Temu divide el pedido, hay **varias guías** en el mismo pedido.
4. Cada cliente dentro del pedido recibe su propio **código DC-xxxx** para seguir su envío. El cliente **nunca ve los productos**, solo el seguimiento.
5. **Carrito "Por comprar"**: encargos anotados que aún no se compran en Temu. Con "Ya lo compré" pasan a un pedido de Temu.
6. **Entrega**:
   - En Aguadulce la entregan ellos mismos, coordinando por WhatsApp.
   - A otras provincias envían por **Transporte Ferguson** o **Servientrega**. La tarifa varía según provincia y peso, se escribe a mano al despachar y **se suma al saldo del cliente**.
   - Ellos marcan "Entregado" cuando el cliente recibe.
7. **Cobros**: cada pedido de cliente tiene costo Temu, precio cobrado, adelanto o abonos y saldo. Ganancia = cobrado − costo Temu. El envío nacional no cuenta como ganancia, lo paga el cliente.
8. **Atascado**: una guía con 5 o más días sin movimiento, antes de llegar a DC.

### Etapas (índice usado en el código)
`0 Por comprar · 1 Comprado · 2 Preparando · 3 Salió del almacén · 4 En vuelo · 5 Llegó a Panamá · 6 En aduana · 7 Recibido por DC · 8 Por entregar (coordinando / enviado por transporte) · 9 Entregado`

Nombres en el panel (`ET`): 1 **Realizado** (control interno), 7 **Recibido**, 8 **Preparando despacho** (o "Enviado por …" si ya se despachó a provincia), 9 **Entregado**. En la app del cliente: 7 "Recibido por DC Marketing", 8 "Preparando tu entrega".

Las etapas 2 a 6 vienen del rastreo de cada guía. **7 (Recibido), 8 y 9 se marcan a mano** (botones "Ya lo recibí", "Preparando despacho", "Marcar entregado"); el rastreo automático no debe pasar de 6. Un pedido sin guía se puede marcar recibido (`o.rec`). La etapa de un pedido es la etapa mínima entre sus guías.

## WhatsApp (decisión tomada)

- Se usa el **WhatsApp personal** de Diego y Cinthya, **no** la WhatsApp Business API, porque cobra.
- El envío es semiautomático: la app arma un link `https://wa.me/507XXXXXXXX?text=...` con el mensaje y el link de seguimiento. La persona lo toca en su teléfono y le da enviar.
- Un link de wa.me no elige desde qué número se envía; sale del WhatsApp abierto en ese teléfono. Por eso cada uno usa el panel en su propio celular.

## Seguimiento de guías (decisión tomada)

- **No** se entra a las cuentas de Temu para el seguimiento automático: Temu no tiene API pública y automatizarlo va contra sus términos.
- Se rastrea por **número de guía** con **17TRACK** (API v2.2).
- **Edge Function `rastrear-guias`** (Supabase) + **pg_cron `rastrear-guias`** cada 4 horas (minuto 7). No gasta uso de Claude. Toma las guías con menos de 7 etapas de pedidos en etapa 1–6, las registra en 17TRACK una sola vez (`guias_rastreo.registrada`, gasta cupo), consulta `gettrackinfo`, avanza las etapas sin retroceder (InfoReceived→2, PickedUp→3, Departure→4, Arrival→5, aduana tras llegar→6, AvailableForPickup/OutForDelivery/Delivered→7) con las fechas de 17TRACK, actualiza todos los pedidos que comparten la guía y recalcula `vista`. Guarda el último movimiento en `guias_rastreo` y el resumen en `rastreo_estado`. Máximo una corrida cada 20 min (`?forzar=1` la salta).
- La clave va en el secreto **`TRACK17_KEY`** de Edge Functions (el dueño la escribe en Supabase; nunca en el código ni en el chat). Sin el secreto, la función responde "Falta el secreto TRACK17_KEY".

## Pagos (decisión tomada)

- Cada pedido guarda `pagos=[{m,f,por}]` (monto, fecha, quién) y `abonado` = la suma (se mantiene igual con `ponerPagos()`). Pedidos viejos sin `pagos` se leen con `pagosDe()` como un pago en la fecha del pedido.
- Sección **Pagos** (`#numeros`): pestañas Pagos (todos por fecha, tipo Abono / Completó el pago / Pago completo), Por cliente (cada pedido con sus abonos; si ya no debe, se une en "Pago completo"), Deudas (solo quien debe, con Registrar pago y Recordar saldo) y Ganancia.
- Registrar pedido de Temu tiene "Fecha del pedido" para pasar pedidos de meses anteriores.

## Rastreo con PRS Delivery (en curso)

- Temu entrega en Panamá con **PRS Delivery** (prsdelivery.com). Su página consulta `POST https://sealcargotrack.cloud/api/v2/prod/tracking` con `{"tracking":"GUIA"}`, sin clave ni captcha. Respuesta: `{isSuccess, trackingNumber, movements:[{code,timestamp,location,status,description}]}` (o formato `is_guia`).
- Plan: cambiar `rastrear-guias` para usar PRS en vez de 17TRACK (17TRACK pide correo de empresa; TrackingMore cobra la API), cada hora, sin pasar de etapa 6. Falta una guía real para ver los códigos de movimiento.

## Diseño

- Azul marino **apagado, no eléctrico** (panel `#0F1522`, cliente `#151D2E`), **bandejas negras con letras blancas** (`#08090C`), **dorado del logo `#D7A95B`** y **beige** (`#E8DCC4` en el panel, hoja `#F2ECE1` en el cliente). Gris del logo: `#4B4C4E`.
- **Sin zoom y sin seleccionar texto** en las dos apps (solo en los campos). Todo lo que se copia (códigos DC, número de pedido de Temu, guías, teléfonos, links) lleva un botón de copiar en la esquina (`cp()` → `copiar()`).
- El panel anima al entrar a cada sección (`animar()`): tarjetas escalonadas, números que cuentan (`data-n`), ruedas que se llenan (`@property --p`) y barras que crecen.
- Fuentes: Unbounded (títulos), Figtree (texto) e IBM Plex Mono (números de pedido y guías).
- El dueño pidió que **no parezca hecho por IA**: nada de plantillas genéricas.
- Las dos apps se ven distintas a propósito:
  - El panel es oscuro, con menú lateral en computadora y barra flotante abajo en celular.
  - La app del cliente es clara, con una banda marina y la ruta animada del paquete (China → En vuelo → Panamá → Tu puerta).
- **Se usan casi siempre en celular.** Deben quedar al ancho exacto de la pantalla, sin zoom ni scroll horizontal. Los campos de texto llevan letra de 16 px o más, porque con menos el iPhone hace zoom al tocarlos. Antes de entregar cualquier cambio, revisa a 390 px de ancho.
- Ojo con grid/flex: un hijo con scroll horizontal puede estirar toda la página. Usa `minmax(0,1fr)` y `min-width:0`.

## App del cliente: entrar con nombre y vincular (decisión tomada)

- El cliente **no crea cuenta**: al abrir la app escribe **Nombre** y **Apellido** y toca **Iniciar** (con animación del paquete recorriendo la ruta). Queda recordado en ese teléfono.
- Después ve **Mis pedidos**: "Aún no tienes pedidos", sus pedidos en camino y entregados, encargos anotados y su contacto. Tocando uno ve el seguimiento. Nunca ve artículos ni precios.
- Cada registro llega al panel (Inicio → "Por hacer" y Clientes → "En la app de clientes"). Diego o Cinthya lo **vinculan** con el cliente de su lista, que puede tener otro nombre escrito. El panel sugiere los parecidos. También se puede crear un cliente nuevo con ese nombre.
- **Link personal**: en la ficha del cliente, "Enviar link de la app" manda por WhatsApp `cliente/?i=CÓDIGO&n=Nombre&q=quien`. Al abrirlo el nombre ya viene escrito y el registro queda **vinculado solo**. En la ficha se ve con qué nombre entró y se puede desvincular.
- El link del código (`cliente/#DC-1234`) sigue funcionando sin registrarse.
- Datos: `localStorage` `dc-app-registros` (lista `{id,nombre,apellido,fecha,cliente,invita,via}`) y `dc-app-yo` (registro de ese teléfono). **Solo se comparte con el panel si están en el mismo navegador**; entre teléfonos distintos hace falta Supabase (tabla `registros_app`).
- El manifiesto del cliente no tiene `start_url` a propósito: al instalarla desde el link personal, el ícono abre con ese mismo link y no se pierde la vinculación.

## Estado actual del panel (prototipo)

- **Inicio**: KPIs del equipo, una tarjeta por persona, "Por hacer" de la persona elegida y un tablero de etapas. Tocar un KPI o una etapa abre Pedidos en la vista "Por cliente" ya filtrada.
- **Pedidos**:
  - Vista "Pedidos de Temu": uno por número de pedido, con sus guías y sus clientes desplegables (artículos con costo y cobro), el % de cada cliente y el total de la compra.
  - Vista "Por cliente": lista con filtros.
- **Registrar**:
  - "Pedido de Temu": **primero** número de pedido y guías (con "Otra guía"), **después** los clientes con todos sus artículos (Siguiente/Enter avanza y agrega filas). Por cliente: **¿Cómo pagó?** Aún no / Adelanto (monto) / Completo; eso define lo abonado.
  - "Anotar encargo por comprar".
- **Clientes**: ranking por pedidos o por gasto, clientes frecuentes (3 pedidos o más), quién debe y ficha con historial; cada pedido de la ficha se abre y muestra sus artículos. En la ficha se cambia quién atiende al cliente.
- **Ganancia**: ganancia del mes del equipo, cuánto aporta cada persona y gráfica de 6 meses.

## Pendientes, en orden sugerido

1. ~~Crear el repo nuevo `DicynMarketing/dc-rastreo`~~ (hecho). **Falta activar GitHub Pages** (Settings → Pages → Deploy from a branch → `main` / root). El repo `dicyn-color` es de la app de colores, que ya no se usará. No mezclar.
2. ~~Base de datos compartida en Supabase~~ (hecho, ver "Base de datos"). Antes era:
   - Tablas sugeridas: `clientes`, `pedidos_temu` (número único), `pedidos` (uno por cliente dentro de un pedido de Temu, con código DC), `articulos`, `guias`, `eventos_guia`, `abonos`.
   - Seguridad (RLS): el panel con inicio de sesión o PIN para Diego y Cinthya. La app del cliente solo puede leer un pedido por su código, y sin artículos ni precios de costo.
3. ~~Rastreo automático~~ (hecho: `rastrear-guias`; falta que el dueño ponga `TRACK17_KEY`). Pendiente opcional: mostrar en el panel el último movimiento de cada guía (`guias_rastreo`).
4. **App del cliente leyendo datos reales**: ya lee los pedidos del panel (mismo navegador), muestra varios paquetes y las etapas 7 a 9. Falta leerlos de Supabase. Mostrar el saldo pendiente solo si el dueño lo aprueba.
5. **Editar artículos** de un pedido ya guardado. Hoy no se puede.
6. ~~Instalable en el teléfono~~ (manifiesto e íconos hechos). Falta: logo original grande para íconos más nítidos, y modo sin conexión (service worker) si se quiere.
7. **Dominio propio** (opcional). Hoy el link de seguimiento se arma solo desde donde está publicado el panel (`LINK_BASE` = `../cliente/#` relativo al panel), así que en GitHub Pages ya funciona. Si se compra dominio, cambiar `LINK_BASE` en `panel/index.html`.

## Actualizaciones (cómo publicar una versión)

- `version.json` (raíz) tiene el número de versión de cada app (`admin`, `cliente`) y las `notas`, de la más nueva a la más vieja. Cada nota lleva `fecha`, `admin`, `cliente` (la versión de cada app en ese momento), `titulo`, `admin_items` y `cliente_items`.
- Cada HTML tiene `const APP="admin"|"cliente",APP_VERSION=N;`. Si `version.json` dice un número mayor, aparece **"Nueva actualización"** sobre el menú de abajo. Al tocarlo se ven las novedades y, con "Actualizar ahora", sale la pantalla de carga (buscar, descargar, instalar) y se abre la versión nueva con `?v=N`, que evita la caché de GitHub Pages.
- El **admin** ve sus novedades y las de los clientes, marcadas "Panel" o "Clientes". El **cliente** solo ve `cliente_items`. Un cambio solo del panel no sube la versión del cliente.
- **Cada vez que se publique un cambio**: subir `APP_VERSION` en el HTML que cambió, poner el mismo número en `version.json` y agregar arriba una nota con lo nuevo, escrita para el dueño y sus clientes. Si un HTML no cambió, su número se queda igual.
- Si al actualizar la página nueva todavía no está publicada, se avisa "intenta en uno o dos minutos" y no se queda en un ciclo.

## Base de datos (Supabase)

- Proyecto `dc-rastreo` (`https://jmfyzohwffylzrwkbtwl.supabase.co`). La clave publicable (`sb_publishable_…`) va en los HTML; es pública por diseño. **Nunca** poner la clave de servicio en el código.
- Tablas: `equipo` (correos autorizados del panel), `clientes`, `pedidos` (`data` = el pedido completo como lo usa el panel; `vista` = solo lo que ve el cliente: etapas y fechas, sin artículos ni precios), `registros` (app del cliente), `temu_compras` (ya no se usa; ver "Registro manual").
- **RLS**: solo usuarios con sesión cuyo correo esté en `equipo` leen o escriben las tablas. El público (app del cliente) **no** lee tablas: usa las funciones `app_registrar`, `app_mis_pedidos`, `app_usar_invitacion` y `app_seguimiento` (security definer), que devuelven solo `vista`.
- **Cuentas del equipo (solo 2: Diego y Cinthya)**: se crean desde el panel con "¿Primera vez? Crea tu cuenta": se elige quién es, correo y contraseña (con ojito). El trigger `autoconfirmar_equipo` la confirma y la agrega a `equipo` si ese lugar está libre; `cupos_equipo()` dice qué lugares quedan. Si la cuenta ya existía, `reclamar_lugar(nombre)` le da el lugar libre. Con los 2 lugares ocupados nadie más entra. Para liberar un lugar: borrar la fila de `equipo` (y el usuario en `auth.users` si se quiere).
- **PIN y Face ID / huella** (solo en el dispositivo, `localStorage` `dc-pin`): PIN de 4 o 6 dígitos guardado como SHA-256 con sal, se pide al abrir y al volver tras 1 minuto; 5 intentos fallidos cierran la sesión. Face ID / huella con WebAuthn (credencial de plataforma): si está activado es **lo primero** al abrir: se lanza solo; si falla, botón "Intentar de nuevo"; al segundo fallo aparece el PIN, que tiene el ícono para reintentar Face ID / huella. "Olvidé mi PIN" cierra sesión y se entra con contraseña. Menú **Configuración**: se abre tocando el **logo de DC Marketing** (arriba, con engranaje; en computadora, el logo del menú lateral) o el enlace al final de Inicio. Incluye PIN, Face ID / huella, cambiar contraseña, bloquear, cerrar sesión y versión del panel ("Buscar actualización").
- Después de desbloquear o entrar, si `version.json` trae una versión mayor se abre sola la hoja "Nueva actualización" (`avisarActualizacion()`); el dueño actualiza a mano con "Actualizar ahora".
- **Panel**: al entrar carga todo en memoria (`D`, `REGS`), guarda solo lo que cambió (`subir()`, comparando con `SNAP`) y escucha cambios en tiempo real (`escuchar()`). Si no hay internet, reintenta cada 15 s; el punto junto al logo es verde (en línea), dorado (guardando) o rojo (sin conexión). Lo que hubiera en `localStorage` (`dc-panel-v5`) se sube una sola vez al entrar.
- **App del cliente**: guarda en `localStorage` `dc-app-yo2` = `{id, token, nombre, apellido}`; consulta sus pedidos con `app_mis_pedidos` al abrir, al volver a la app y cada minuto.

## Registro manual (decisión tomada)

- **Se quitó "Importar de Temu"** (no le funcionó al dueño): ya no hay pantalla de importar, "Por repartir", "Repartir" ni `#importar`, y el panel no lee `temu_compras`. Registrar queda solo manual: **"Pedido de Temu"** y **"Encargo por comprar"**.
- En Supabase ya se borraron las compras importadas y la función `importar_temu`. Queda la tabla `temu_compras` vacía; se puede eliminar cuando nadie use versiones viejas del panel (v10 o menos la leen).
- No volver a crear revisiones automáticas de correo ni tareas programadas sin que el dueño lo pida.

## Cambio de persona en el panel

- El selector Diego / Cinthya (y las tarjetas del equipo en Inicio) piden **confirmar con PIN o Face ID / huella** para ver la vista de la otra persona (`pedirCambio()`); volver a la propia cuenta (`CUENTA`) es libre. Sin PIN configurado, se confirma con un mensaje.

## Notas técnicas

- Los datos ya no viven en `localStorage` (ver "Base de datos"). Solo quedan ahí: la sesión del equipo (`dc-sesion`), quién usa el panel (`dc-panel-who`) y el registro del cliente (`dc-app-yo2`).
- La app del cliente pide sus pedidos y el seguimiento a Supabase con las funciones `app_*`. Rutas: `#DC-4821` seguimiento, `#codigo` buscar por código, sin hash: bienvenida o Mis pedidos.
- Las etapas del cliente son las mismas 1 a 9 del panel (índice 0 a 8 en `ESTADOS`).
- `CLIENTE_URL` en el panel apunta a `../cliente/`.
- Para probar en local: `python3 -m http.server` en la raíz y abrir `http://localhost:8000/panel/`.
