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

## Decisiones tomadas
- Pocha: al asistir hay que montar si se puede (Fournier no lo deja claro; confirmar con el usuario si su grupo juega distinto).
- Mus: por defecto a 40 piedras, 3 juegos y 8 reyes; el anfitrión puede cambiarlo.
