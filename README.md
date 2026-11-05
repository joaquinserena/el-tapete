# El Tapete · Mus y Pocha online

Web para jugar al mus (4 jugadores, por parejas) y a la pocha (3, 4 o 5 jugadores) con amigos,
desde el ordenador o el móvil, sin instalar nada: solo hay que abrir un enlace.

## Cómo funciona

- Un **servidor** (Node.js) reparte las cartas, aplica las normas y guarda las estadísticas.
  Las cartas de cada jugador solo las ve él: nadie puede hacer trampas mirando el código de la página.
- Cada amigo abre la **misma dirección web** en su navegador, pone su nombre y elige avatar.
- Elige juego → entra en la mesa de ese juego. El primero que se sienta es el **anfitrión**:
  elige las opciones y pulsa **Empezar partida** cuando estén todos.
- Si alguien se desconecta (se le va el WiFi, cierra el móvil…), su silla se guarda: al volver a
  abrir la web vuelve directamente a la mesa.
- Al acabar cada partida se guardan victorias y partidas jugadas, más estadísticas propias de cada juego.

## Probarlo en tu ordenador

```bash
npm install
npm start
```

Abre http://localhost:3000 (puedes abrir varias pestañas en modo incógnito para simular jugadores).

`npm test` simula cientos de partidas aleatorias para comprobar que los motores no fallan.

## Jugar online con amigos

### Opción A — Gratis y sin tener el ordenador encendido (recomendada): Render + Neon

1. **GitHub**: crea una cuenta en github.com y sube esta carpeta a un repositorio nuevo
   (botón "Add file → Upload files" sirve, sin la carpeta `node_modules` ni `data`).
2. **Base de datos (para no perder estadísticas)**: crea una cuenta en neon.tech (gratis),
   crea un proyecto y copia la *connection string* (empieza por `postgresql://...`).
3. **Render**: crea una cuenta en render.com con tu GitHub → *New → Web Service* → elige el repositorio.
   - Runtime: Node · Build command: `npm install` · Start command: `npm start` · Plan: **Free**
   - En *Environment* añade la variable `DATABASE_URL` con la connection string de Neon.
4. Render te da una dirección tipo `https://el-tapete.onrender.com`. Esa es la que mandas a tus amigos.

Lo que hay que saber del plan gratuito de Render:
- Si nadie usa la web durante 15 minutos, el servidor "se duerme". La primera persona que entra
  después espera unos 30–60 segundos a que despierte; luego va normal.
- Mientras alguien tenga la web abierta, la propia página mantiene el servidor despierto.
- Si el servidor se reinicia (al subir una versión nueva o al dormirse), las partidas *en curso* se pierden.
  Las estadísticas no, porque están en Neon.

### Opción B — Con tu ordenador encendido: Cloudflare Tunnel (gratis, sin cuentas)

1. `npm start` en esta carpeta.
2. Instala cloudflared (`winget install --id Cloudflare.cloudflared`) y ejecuta:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. Te dará una dirección `https://algo-aleatorio.trycloudflare.com`. Mándasela a tus amigos.
   Cambia cada vez que lo arrancas. Las estadísticas se guardan en `data/db.json` de tu ordenador.

## Estructura

- `server.js` — servidor web, salas, anfitrión, reconexiones, estadísticas.
- `src/mus.js`, `src/pocha.js` — normas de cada juego (según las normas de Fournier).
- `src/storage.js` — guardado en `data/db.json` o en Postgres si existe `DATABASE_URL`.
- `public/` — la web (pantalla de entrada, menú, estadísticas y tapete).
