# El Tapete — notas para Claude

Web para jugar al mus (4 jugadores, por parejas) y a la pocha (3, 4 o 5) con amigos.
El usuario escribe en español: responde en español.

## Despliegue
- Repo: github.com/joaquinserena/el-tapete, rama `main`.
- Render (plan Free) publica automáticamente cada cambio en `main`: https://el-tapete.onrender.com
- Estadísticas en Neon Postgres mediante la variable `DATABASE_URL`, configurada en Render.
  Es un secreto: nunca la pidas en el chat.
- Para publicar un cambio tiene que llegar a `main` (merge del PR, o hazlo tú si el usuario dice "publícalo").
  Un despliegue reinicia el servidor y corta las partidas en curso.

## Estructura
- `server.js`: salas (una por juego en espera, código de 4 letras), anfitrión = primero en entrar,
  reconexión por `playerId` guardado en localStorage, estadísticas al acabar la partida, limpieza de salas vacías.
- `src/mus.js`, `src/pocha.js`: motores con las normas de Fournier (nhfournier.es/como-jugar/mus y /pocha).
- `src/storage.js`: `data/db.json` en local, o una fila JSONB en Postgres si hay `DATABASE_URL`.
- `public/`: cliente sin build (index.html, style.css, cards.js con cartas SVG propias, app.js).
  Estética: tapete verde, cartas blancas, reverso rojo.

## Pruebas
- `npm test`: 600 partidas simuladas con jugadas al azar.
- `node test/bots.js <mus|pocha> <n> [url] [codigo]`: bots que se sientan y juegan.
  Con `BOT_AUTOSTART=1 BOT_DELAY=10` juegan una partida completa y muestran las estadísticas.
  No lances bots contra la web publicada: ensucian las estadísticas reales.

## Decisiones tomadas (reglas del grupo)
- Pocha, baraja entera con 3, 4 o 5 jugadores (máx. 13, 10 u 8 cartas). Manos: indio (1 carta, ves las de los
  demás y no la tuya), 1..max-1, tantas subastas como jugadores (se reparte todo; con 3 sobra una carta oculta),
  max-1..1 e indio. 3 jugadores = 29 manos, 4 = 24, 5 = 21.
- Pocha, subasta: mínimo = la mitad de las bazas (floor). Por turnos desde el mano se sube o se pasa (quien pasa
  queda fuera) hasta que solo queda uno. Si nadie puja: se reparte otra vez; si vuelve a pasar, baja el mínimo en 1
  y el primero que se pida ese mínimo se lo queda (no se puede pedir más). El ganador elige triunfo; luego los demás
  se piden como siempre y todos puntúan. Siempre sale el mano (derecha del que reparte).
- Pocha: el último en pedirse no puede hacer que la suma iguale las bazas. Al asistir hay que montar si se puede.
- Pocha: el primer reparto se sortea tirando cartas desde alguien al azar hasta el primer rey (12). Reparte quien lo
  saca, empieza el de su derecha, y el reparto va rotando a la derecha.
- Mus: sorteo de parejas con reyes (solo los 12): los dos primeros con rey van juntos (asientos 1 y 3), reparte la
  otra pareja (asiento 0) y el primero que sacó rey es mano. Sin señas. A 40 piedras, 3 juegos, 8 reyes por defecto.
- "Derecha" = asiento siguiente; en pantalla el siguiente se dibuja a tu derecha (sentido antihorario).
- Pruebas en local: `TAPETE_DEBUG_HAND=13` hace que la pocha empiece en esa mano (para ver subastas).
