# DC Marketing · Rastreo de pedidos de Temu

Proyecto de DC Marketing (Aguadulce, Coclé, Panamá). El negocio hace pedidos de Temu por encargo para clientes (no vende en Temu). Este repo tiene dos apps web y hoy son **prototipos funcionales** con datos de ejemplo guardados en `localStorage`. El siguiente paso es conectarlas a una base de datos real.

Habla siempre en español con el dueño. Escribe para alguien que no es programador: explica en lenguaje simple qué cambió y qué tiene que hacer él.

## Estructura

```
index.html           Raíz: redirige a cliente/ (conserva el #código)
panel/index.html     Centro de Envíos: app interna para Diego y Cinthya (oscura, de trabajo)
cliente/index.html   Mi Pedido DC: lo que ve el cliente con su código (clara, visual)
assets/              Logo en PNG transparente, versión 160 px (dc-logo-160.png)
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

Las etapas 1 a 7 vienen del rastreo de cada guía. Las 8 y 9 se marcan a mano. La etapa de un pedido es la etapa mínima entre sus guías.

## WhatsApp (decisión tomada)

- Se usa el **WhatsApp personal** de Diego y Cinthya, **no** la WhatsApp Business API, porque cobra.
- El envío es semiautomático: la app arma un link `https://wa.me/507XXXXXXXX?text=...` con el mensaje y el link de seguimiento. La persona lo toca en su teléfono y le da enviar.
- Un link de wa.me no elige desde qué número se envía; sale del WhatsApp abierto en ese teléfono. Por eso cada uno usa el panel en su propio celular.

## Seguimiento de guías (decisión tomada)

- **No** se entra a las cuentas de Temu para el seguimiento automático: Temu no tiene API pública y automatizarlo va contra sus términos.
- Se rastrea por **número de guía** con un servicio de rastreo. La opción elegida es **17TRACK** (tiene API), aunque AfterShip es otra posible. Falta que el dueño cree la cuenta y entregue la clave de API.
- Una tarea programada consulta cada pocas horas, convierte los eventos de la paquetería a las etapas 1 a 7 y guarda el historial con fechas. Si una guía es compartida entre varios clientes, se actualizan todos.

## Diseño

- Azul marino con el **dorado del logo `#D7A95B`**. Gris del logo: `#4B4C4E`.
- Fuentes: Unbounded (títulos), Figtree (texto) e IBM Plex Mono (números de pedido y guías).
- El dueño pidió que **no parezca hecho por IA**: nada de plantillas genéricas.
- Las dos apps se ven distintas a propósito:
  - El panel es oscuro, con menú lateral en computadora y barra flotante abajo en celular.
  - La app del cliente es clara, con una banda marina y la ruta animada del paquete (China → En vuelo → Panamá → Tu puerta).
- **Se usan casi siempre en celular.** Deben quedar al ancho exacto de la pantalla, sin zoom ni scroll horizontal. Los campos de texto llevan letra de 16 px o más, porque con menos el iPhone hace zoom al tocarlos. Antes de entregar cualquier cambio, revisa a 390 px de ancho.
- Ojo con grid/flex: un hijo con scroll horizontal puede estirar toda la página. Usa `minmax(0,1fr)` y `min-width:0`.

## Estado actual del panel (prototipo)

- **Inicio**: KPIs del equipo, una tarjeta por persona, "Por hacer" de la persona elegida y un tablero de etapas. Tocar un KPI o una etapa abre Pedidos en la vista "Por cliente" ya filtrada.
- **Pedidos**:
  - Vista "Pedidos de Temu": uno por número de pedido, con sus guías y sus clientes desplegables (artículos con costo y cobro), el % de cada cliente y el total de la compra.
  - Vista "Por cliente": lista con filtros.
- **Registrar**:
  - "Pedido de Temu": varios clientes con varios artículos cada uno, luego número de pedido y guía.
  - "Anotar encargo por comprar".
- **Clientes**: ranking por pedidos o por gasto, clientes frecuentes (3 pedidos o más), quién debe y ficha con historial. En la ficha se cambia quién atiende al cliente.
- **Ganancia**: ganancia del mes del equipo, cuánto aporta cada persona y gráfica de 6 meses.

## Pendientes, en orden sugerido

1. ~~Crear el repo nuevo `DicynMarketing/dc-rastreo`~~ (hecho). **Falta activar GitHub Pages** (Settings → Pages → Deploy from a branch → `main` / root). El repo `dicyn-color` es de la app de colores, que ya no se usará. No mezclar.
2. **Base de datos compartida en Supabase**, porque Diego y Cinthya deben ver los mismos datos.
   - Tablas sugeridas: `clientes`, `pedidos_temu` (número único), `pedidos` (uno por cliente dentro de un pedido de Temu, con código DC), `articulos`, `guias`, `eventos_guia`, `abonos`.
   - Seguridad (RLS): el panel con inicio de sesión o PIN para Diego y Cinthya. La app del cliente solo puede leer un pedido por su código, y sin artículos ni precios de costo.
3. **Rastreo automático**: Edge Function más cron con la API de 17TRACK. La clave va como secreto y nunca en el HTML.
4. **App del cliente leyendo datos reales**: soportar varios paquetes ("2 de 3 paquetes en Panamá") y las etapas 7 a 9 de entrega local o por transporte. Mostrar el saldo pendiente solo si el dueño lo aprueba.
5. **Editar artículos** de un pedido ya guardado. Hoy no se puede.
6. **Instalable en el iPhone** (PWA: manifest, ícono y pantalla completa) para el panel y para la app del cliente.
7. **Dominio propio** (opcional). Hoy el link de seguimiento se arma solo desde donde está publicado el panel (`LINK_BASE` = `../cliente/#` relativo al panel), así que en GitHub Pages ya funciona. Si se compra dominio, cambiar `LINK_BASE` en `panel/index.html`.

## Notas técnicas

- El panel guarda en `localStorage` con la llave `dc-panel-v5`. Los datos de ejemplo están marcados `ej:1`. Al conectar Supabase, eliminar el ejemplo y `localStorage`.
- La app del cliente tiene sus pedidos de ejemplo dentro del código (`PEDIDOS`) y lee el código desde el `#hash` de la URL (`cliente/#DC-4821`). Sin código muestra la pantalla para escribirlo.
- `CLIENTE_URL` en el panel apunta a `../cliente/`.
- Para probar en local: `python3 -m http.server` en la raíz y abrir `http://localhost:8000/panel/`.
