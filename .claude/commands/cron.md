---
description: "Démarre les crons récurrents du projet actif en lisant la configuration depuis .provider/config.md."
---

# Cron — Tâches planifiées génériques

Lance les crons récurrents nécessaires au fonctionnement quotidien du projet actif. La configuration complète des crons (horaires, jours, prompts) est définie dans `.provider/config.md`.

---

## Étape 0 — Charger le contexte projet

**OBLIGATOIRE.** Lis le fichier `.provider/config.md` pour obtenir la section **crons** qui contient :

- **Nom** de chaque cron
- **Expression cron** (horaire et jours d'exécution)
- **Prompt** à exécuter (skill à lancer, arguments, workflow git)
- **Récurrence** (oui/non)
- **Description** de l'action

Le fichier `config.md` définit entièrement les crons du projet. Ce skill ne contient aucun horaire ni prompt en dur — tout vient de la configuration.

---

## Procédure

### Étape 1 — Lire la configuration des crons

Ouvre `.provider/config.md` et localise la section dédiée aux crons. Elle liste chaque tâche planifiée avec tous les paramètres nécessaires.

### Étape 2 — Créer chaque cron

Pour chaque entrée de la configuration, utilise l'outil `CronCreate` avec les paramètres suivants :

| Paramètre | Source |
|-----------|--------|
| Expression cron | Depuis config.md (ex: `30 8 * * 1-5`) |
| Prompt | Depuis config.md — le prompt complet incluant le skill à lancer et le workflow git |
| Récurrence | Depuis config.md (généralement oui) |

Chaque prompt de cron doit typiquement :
1. Exécuter le skill approprié (ex: `/write-article`, `/provider`, etc.)
2. Inclure le workflow git post-exécution :
   - `git add` les fichiers créés ou modifiés
   - `git commit -m "[message descriptif]"`
   - `git push origin main`
3. Mettre à jour les fichiers mémoire si pertinent
4. Préciser "Ne demande aucune confirmation, fais tout de manière autonome."

### Étape 3 — Confirmer avec un résumé

Après la création de tous les crons, afficher un **tableau récapitulatif** :

```
| # | Nom | Cron | Heure | Jours | Action | ID |
|---|-----|------|-------|-------|--------|----|
| 1 | ... | ...  | ...   | ...   | ...    | [ID retourné par CronCreate] |
| 2 | ... | ...  | ...   | ...   | ...    | [ID retourné par CronCreate] |
| ... |
```

---

## Notes importantes

### Durée de vie des crons
- **Expiration automatique après 7 jours** — les crons doivent être recréés régulièrement
- **Disparaissent si la session Claude est fermée** — ils sont liés à la session en cours
- Pour une solution persistante → configurer les MCP connectors puis utiliser `/schedule`

### Autonomie
- Chaque cron s'exécute de manière **autonome** (sans confirmation utilisateur)
- Les prompts dans config.md doivent être rédigés en conséquence (instructions complètes, pas de question)

### Gestion
- Pour lister les crons actifs : utiliser `CronList`
- Pour supprimer un cron : utiliser `CronDelete` avec l'ID du cron
- Pour modifier un cron : supprimer l'ancien + recréer avec les nouveaux paramètres

---

## Résumé du workflow

```
1. Lire .provider/config.md → section crons
2. Pour chaque cron : CronCreate avec les paramètres du config
3. Afficher le tableau récapitulatif avec les IDs
4. Rappeler les limitations (7 jours, session-dependent)
```
