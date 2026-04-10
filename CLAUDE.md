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

## Skills centralisés

telegram-bridge héberge les **skills partagés** utilisés par tous les projets. Chaque projet les consomme via des symlinks depuis `.claude/commands/` vers `telegram-bridge/.claude/commands/`.

| Skill | Rôle |
|-------|------|
| `provider.md` | Orchestrateur générique — charge `.provider/` pour le contexte projet |
| `write-article.md` | Rédacteur SEO générique — templates et scoring depuis `identity.md` |
| `research.md` | Recherche documentaire — sources depuis `sources.md` |
| `seo-strategy.md` | Stratège SEO — clusters et keywords |
| `editorial-plan.md` | Planificateur éditorial — calendrier et suivi |
| `generate-image.md` | Générateur d'images — charte depuis `charte.md` |
| `cron.md` | Scheduler de crons — planning depuis `config.md` |

### Architecture "Convention over Configuration"

Chaque projet DOIT avoir ces fichiers dans `.provider/` :

| Fichier | Contenu |
|---------|---------|
| `identity.md` | Doctrine, ton, langue, conformité, types de contenu, scoring, templates |
| `sources.md` | Sources de recherche prioritaires, méthodologie, axes spécifiques |
| `charte.md` | Identité visuelle, palette, préfixe prompt image, formats |
| `config.md` | Structure technique, volumes, crons, sub-skills, publication |
| `memory.md` | Décisions stratégiques validées |
| `editorial.md` | Calendrier éditorial avec statuts |
| `keywords.md` | Mots-clés, clusters, priorités |

Les 4 premiers sont **obligatoires** et contiennent toute la spécificité du projet. Les skills centralisés lisent ces fichiers en Step 0 pour s'adapter au contexte.

## Concepts clés

- **Session grammy**: stocke le projet actif et l'état d'attente d'arguments skill
- **Queue par projet**: mutex empêchant les exécutions Claude concurrentes sur un même projet
- **Découverte de skills**: scan dynamique des fichiers `.md` dans `.claude/commands/` de chaque projet (symlinks + fichiers réels)
- **Skills centralisés**: 7 skills génériques dans `telegram-bridge/.claude/commands/`, symlinkés dans chaque projet
- **Skills spécifiques**: fichiers réels dans chaque projet pour les skills sans équivalent ailleurs
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
- `PROJECTS_DIR` (optionnel, défaut: `~/projects`)
- `BRIDGE_DIR` (optionnel, défaut: `process.cwd()`)
- `PROJECTS_CONFIG` (optionnel, défaut: `$BRIDGE_DIR/projects.json`)
- `MEMORY_DIR` (optionnel, défaut: `$PROJECTS_DIR/.provider/memory`)

## Configuration des projets

Les projets sont définis dans `projects.json` (non tracké par git). Voir `projects.json.example` pour le format attendu. Chaque entrée :

```json
{ "id": "my-project", "prefix": "myproj", "name": "My Project", "dir": "com.my-project", "emoji": "...", "siteUrl": "https://..." }
```

Les commandes Telegram (`/myproj`) et les entrées BotFather sont générées automatiquement depuis ce fichier.

## Conventions

- Code et commentaires en anglais, UI bot en français
- Pas de tests unitaires pour le moment
- Bot mono-utilisateur (owner only)
