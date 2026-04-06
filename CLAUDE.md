# Telegram Bridge

Bot Telegram qui sert de pont entre Telegram et le CLI Claude. Permet d'exécuter des commandes Claude depuis Telegram, de gérer plusieurs projets, et de suivre les coûts.

## Stack technique

- **Runtime**: Node.js >= 20
- **Langage**: TypeScript 5.7 (strict), ES modules
- **Framework bot**: grammy
- **Config env**: dotenv

## Commandes

```bash
pnpm dev       # Dev avec hot reload (tsx watch)
pnpm build     # Compile TypeScript vers dist/
pnpm start     # Lance la version compilée
```

## Architecture

```
src/
  index.ts              # Point d'entrée, init bot + routes + shutdown
  bot.ts                # Création bot grammy, session middleware
  config.ts             # Chargement variables d'environnement
  router.ts             # Enregistrement des commandes Telegram
  changelog.ts          # Log des exécutions en fichiers markdown
  claude/
    executor.ts         # Spawn du process Claude CLI + parsing JSON
    queue.ts            # File d'attente mutex par projet
  handlers/
    project.ts          # Exécution projet + UI progression
    botmanager.ts       # Status, coûts, santé, kill, reload
    skill.ts            # Callbacks inline pour sélection de skills
    freetext.ts         # Routage texte libre vers projet actif
    memory.ts           # Gestion mémoire globale (/memory)
    cron.ts             # Gestion tâches planifiées (/cron)
  memory/
    store.ts            # CRUD fichiers markdown mémoire
  cron/
    types.ts            # Interface CronJob
    parser.ts           # Parseur expressions cron 5 champs
    store.ts            # CRUD jobs.json
    scheduler.ts        # Boucle d'exécution (tick 60s)
  middleware/
    auth.ts             # Vérification owner ID (drop silencieux)
    logging.ts          # Log JSON des événements
  projects/
    registry.ts         # Définitions projets, scan des skills .claude/commands/
  ui/
    keyboards.ts        # Construction clavier inline grammy
    formatter.ts        # Conversion Markdown -> HTML Telegram, split messages
```

## Concepts clés

- **Session grammy**: stocke le projet actif et l'état d'attente d'arguments skill
- **Queue par projet**: mutex empêchant les exécutions Claude concurrentes sur un même projet
- **Découverte de skills**: scan dynamique des fichiers `.md` dans `.claude/commands/` de chaque projet
- **Exécution Claude**: subprocess avec `--output-format json` et `--dangerously-skip-permissions`
- **Suivi des coûts**: map en mémoire par projet, persisté dans les changelogs
- **Messages Telegram**: split automatique à 4096 caractères, conversion Markdown -> HTML
- **Mémoire globale**: fichiers markdown dans `.provider/memory/`, injectés dans chaque prompt Claude via balises `<memory>`
- **Cron**: jobs persistés dans `.provider/cron/jobs.json`, scheduler tick 60s, création via langage naturel (Claude écrit le fichier)

## Variables d'environnement

- `TELEGRAM_BOT_TOKEN` (requis)
- `TELEGRAM_OWNER_ID` (requis)
- `CLAUDE_PATH` (optionnel, défaut: "claude")
- `CLAUDE_TIMEOUT_MS` (optionnel, défaut: 300000)
- `MEMORY_DIR` (optionnel, défaut: `{projectsDir}/.provider/memory`)

## Conventions

- Code et commentaires en anglais, UI bot en français
- Pas de tests unitaires pour le moment
- Bot mono-utilisateur (owner only)
