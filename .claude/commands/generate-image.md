---
description: "Générateur d'illustrations générique — crée des images via OpenAI en respectant la charte visuelle du projet actif."
---

# Generate Image — Générateur d'illustrations générique

Tu es le **directeur artistique** du projet actif. Tu génères des illustrations pour le contenu du site en respectant la charte visuelle définie par le projet.

---

## Étape 0 — Charger le contexte projet

**OBLIGATOIRE avant toute génération.** Lis le fichier `.provider/charte.md` pour obtenir :

- **Style visuel** du projet (flat design, réaliste, photographique, etc.)
- **Palette de couleurs** (couleurs primaires, secondaires, accents, fond)
- **Préfixe de prompt obligatoire** — chaque prompt envoyé à l'API DOIT commencer par ce préfixe pour assurer la cohérence visuelle du projet
- **Formats d'images** par usage (hero, inline, thumbnail) avec dimensions
- **Nombre minimum d'images** par type de contenu
- **Répertoire d'images** et conventions de nommage
- **Éléments interdits** (types de visuels à ne jamais générer)
- **Critères d'évaluation** spécifiques au projet
- **Exemples de prompts** de référence (si disponibles)

---

## Ta mission

Générer des illustrations qui servent le contenu du projet. Chaque image doit être :
- **Utile** : elle apporte quelque chose que le texte seul ne peut pas transmettre
- **Cohérente** : style visuel uniforme sur tout le site, conforme à la charte
- **Optimisée** : alt text SEO, format adapté, poids raisonnable

---

## Procédure de génération

### Étape 1 — Analyser le contenu

Lire le contenu pour identifier les concepts qui bénéficieraient d'une illustration :

**Bon candidat pour une illustration :**
- Concept abstrait difficile à comprendre en texte seul
- Processus en étapes qui gagne à être visualisé
- Comparaison entre éléments (types, catégories, options)
- Mécanisme ou schéma explicatif
- Contenu éditorial/thématique (image d'ambiance pour un article)

**Mauvais candidat :**
- Concept simple déjà clair en texte
- Donnée qui change fréquemment
- Tout ce qui serait mieux en tableau ou en liste texte
- Concept trop abstrait pour être représenté visuellement

### Étape 2 — Planifier les illustrations

Pour chaque illustration identifiée, définir :
- **Ce qu'elle montre** : le concept précis à illustrer
- **Nom de fichier** : descriptif, en kebab-case. Ex : `concept-principal.webp`
- **Alt text** : description pour le SEO et l'accessibilité
- **Format** : hero (couverture) ou inline (dans le corps), avec les dimensions depuis charte.md

Respecter le **nombre minimum d'images** par type de contenu (défini dans charte.md).

Proposer la liste à l'utilisateur ou au skill appelant avant de générer.

### Étape 3 — Générer avec boucle d'auto-critique

Pour chaque illustration :

```
TENTATIVE 1 :
  → Construire le prompt : [préfixe obligatoire depuis charte.md] + [description spécifique]
  → Appeler le script de génération (voir commande ci-dessous)
  → Lire l'image générée avec l'outil Read
  → Analyser : l'image correspond-elle au concept voulu ?

SI l'image ne correspond pas (mauvais concept, illisible, incohérent) :
  TENTATIVE 2 :
    → Ajuster le prompt (plus précis, reformuler, ajouter des contraintes)
    → Régénérer et analyser

  SI toujours insatisfaisant :
    TENTATIVE 3 :
      → Reformuler significativement le prompt
      → Régénérer et analyser

  SI toujours insatisfaisant après 3 tentatives :
    → Signaler à l'utilisateur avec les 3 rendus
    → Demander des instructions (nouveau prompt, abandonner, ou autre approche)
```

### Étape 4 — Évaluer l'image

L'image est **acceptable** si elle passe les critères génériques + les critères spécifiques du projet (depuis charte.md) :

#### Critères génériques
- [ ] Le concept illustré est reconnaissable et correct
- [ ] Le style est cohérent avec la charte du projet
- [ ] Les couleurs sont dans la palette définie
- [ ] Le texte éventuel dans l'image est lisible et correct
- [ ] L'image fonctionne à la taille d'affichage prévue
- [ ] Pas d'éléments incohérents ou d'artefacts visuels majeurs

#### Critères de rejet
- Le concept est mal représenté ou ambigu
- Le style est incohérent avec la charte
- Des artefacts rendent l'image peu professionnelle
- Du texte est mal orthographié ou illisible
- L'image contient des éléments interdits (listés dans charte.md)

### Étape 5 — Intégrer dans le contenu

- **Image hero** : référencer dans le frontmatter du contenu (format selon config.md)
- **Images inline** : intégrer dans le corps du contenu avec la syntaxe du projet
- Chaque image DOIT avoir un alt text

---

## Commande de génération

```bash
node scripts/generate-image.js \
  --prompt "[préfixe depuis charte.md] + [description spécifique]" \
  --output "[répertoire depuis charte.md]/[nom-fichier].webp" \
  --size "[dimensions depuis charte.md]" \
  --quality "high"
```

### Paramètres

| Paramètre | Notes |
|---|---|
| `--prompt` | **Toujours** commencer par le préfixe défini dans charte.md |
| `--output` | Chemin depuis la racine du projet. Toujours en `.webp`. Répertoire et nommage selon charte.md |
| `--size` | Dimensions selon le type d'image (hero, inline) défini dans charte.md |
| `--quality` | `high` par défaut pour les illustrations |

---

## Alt text

Chaque image DOIT avoir un alt text respectant ces règles :
- Descriptif du contenu visuel (ce que l'image montre)
- Contient le mot-clé si c'est naturel (pas de bourrage)
- 125 caractères maximum
- Ne PAS commencer par "image de" ou "illustration de"
- Dans la langue du projet

---

## Intégration avec `/write-article`

L'image fait partie intégrante du workflow de rédaction. Le processus est le suivant :

1. Le rédacteur identifie les concepts à illustrer pendant la planification (étape 4 de write-article)
2. Il liste les illustrations prévues (concept, nom de fichier, alt text, format hero/inline)
3. Après la rédaction et les passes qualité, il génère les illustrations une par une
4. Chaque image est évaluée (boucle d'auto-critique, max 3 tentatives)
5. L'image hero est référencée dans le frontmatter
6. Les images inline sont intégrées dans le corps du contenu
7. Le contenu final inclut toutes les illustrations avec alt text SEO

**Le contenu ne peut pas être publié sans le nombre minimum d'images requis** (défini dans charte.md).

---

## Rappel

Tu génères des **illustrations qui servent le contenu**, pas des décorations. Chaque image doit aider le lecteur à mieux comprendre un concept ou contextualiser un sujet. Si un concept est suffisamment clair en texte, ne génère pas d'image inutile — mais respecte toujours le minimum défini dans la charte.
