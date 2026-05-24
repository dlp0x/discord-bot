# soundSHINE Bot

Bot Discord pour diffuser soundSHINE Radio dans un Stage Channel, exposer des metriques via une API Express et automatiser quelques actions autour de la station.

## Apercu

- Commandes slash organisees par domaines: radio, station, requests, systeme, fun.
- Lecture du stream dans un Stage Channel et suivi d'etat du bot.
- API HTTP securisee pour la sante, les logs, les alertes, les metriques et la mise a jour de playlist.
- Suite de tests Vitest et scripts utilitaires de developpement.

## Structure du projet

```text
.
|-- src/
|   |-- api/        # Serveur Express, middlewares et routes HTTP
|   |-- bot/        # Client Discord, commandes, events, handlers et taches
|   |-- core/       # Services metier et cycle de vie de l'application
|   |-- tests/      # Tests Vitest
|   `-- utils/      # Utilitaires partages et acces DB
|-- scripts/        # Scripts dev, infra, git et outils
|-- docs/           # Documentation additionnelle
`-- package.json
```

Point d'entree de l'application: [`src/index.js`](/C:/Users/noordotda/Documents/Github/discord-bot/src/index.js)

## Prerequis

- Node.js 18+
- npm
- Un bot Discord configure avec les permissions adaptees

## Configuration

Le projet charge `.env` puis `.env.<env>` comme `.env.dev` ou `.env.prod`.

Variables minimales:

```env
DISCORD_TOKEN=...
ADMIN_ROLE_ID=...
VOICE_CHANNEL_ID=...
PLAYLIST_CHANNEL_ID=...
```

Variables utiles selon les modules:

```env
CLIENT_ID=...
GUILD_ID=...
DEV_GUILD_ID=...
BOT_ROLE_NAME=soundSHINE
STREAM_URL=...
JSON_URL=...
API_PORT=3000
API_TOKEN=...
LOG_LEVEL=info
REQ_ROLE_ID=...
REQ_CHANNEL_ID=...
UNSPLASH_ACCESS_KEY=...
```

## Demarrage

```bash
npm install
npm run dev
```

Production:

```bash
npm run prod
```

## Scripts utiles

```bash
npm run deploy:dev
npm run deploy:global
npm run clear:dev
npm run clear:global
npm run db:deploy
npm run lint
npm run lint:fix
npm test
npm run test:coverage
npm run test:integration
npm run test:performance
npm run test:stress
npm run test:security
npm run test:all
npm run test:ui
npm run security:check
npm run context:md
```

Les configurations canoniques sont:

- [`src/config/eslint.config.js`](/C:/Users/noordotda/Documents/Github/discord-bot/src/config/eslint.config.js)
- [`src/config/vitest.config.js`](/C:/Users/noordotda/Documents/Github/discord-bot/src/config/vitest.config.js)

## Commandes Discord

- `/help`
- `/ping`
- `/silence <action>`
- `/radio play`
- `/radio stop`
- `/radio nowplaying`
- `/station schedule`
- `/station stats`
- `/station speaker-status`
- `/station promote-speaker`
- `/station stream-config`
- `/request ask`
- `/request edit`
- `/request delete`
- `/request list`
- `/drink`
- `/getwallpaper`

## API HTTP

Base locale par defaut: `http://localhost:3000`

- `GET /`
- `GET /v1/health`
- `GET /v1/metrics`
- `GET /v1/logs`
- `GET/POST /v1/alerts`
- `POST /v1/send-playlist`
- `GET/POST /v1/silence`

Exemple:

```bash
curl http://localhost:3000/v1/health
```

## Notes de maintenance

- Le dossier `scripts/` fait partie du projet et ne doit plus etre ignore par Git.
- Les anciennes configs ESLint/Jest ont ete retirees au profit des configs actuelles sous `src/config/`.
- Les artefacts generes sous `src/node_modules/` sont maintenant ignores.

## Documentation associee

- [`docs/SECURITY.md`](/C:/Users/noordotda/Documents/Github/discord-bot/docs/SECURITY.md)
- [`scripts/README.md`](/C:/Users/noordotda/Documents/Github/discord-bot/scripts/README.md)
- [`src/tests/README.md`](/C:/Users/noordotda/Documents/Github/discord-bot/src/tests/README.md)
