#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Setup a new project from the template
#
# Usage:
#   ./setup-project.sh <project-dir> <app-name> <domain> <site-name> [lang] [emoji]
#
# Example:
#   ./setup-project.sh com.example example example.com "Mon Site" fr "🌐"
#
# This script:
#   1. Copies the template to $PROJECTS_DIR/<project-dir>/
#   2. Replaces all {{placeholders}} with actual values
#   3. Renames the apps/{{app-name}} directory
#   4. Creates symlinks to shared skills
#   5. Initializes git
#   6. Shows next steps (registry, .env, .mcp.json)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${PROJECTS_DIR:-${HOME}/projects}"
TEMPLATE_DIR="${TEMPLATE_DIR:-${PROJECTS_DIR}/.template}"
BRIDGE_COMMANDS="${BRIDGE_COMMANDS:-${SCRIPT_DIR}/.claude/commands}"

# --- Args ---
PROJECT_DIR="${1:?Usage: $0 <project-dir> <app-name> <domain> <site-name> [lang] [emoji] [description]}"
APP_NAME="${2:?Missing app-name}"
DOMAIN="${3:?Missing domain}"
SITE_NAME="${4:?Missing site-name}"
LANG="${5:-fr}"
EMOJI="${6:-📝}"
SITE_DESC="${7:-$SITE_NAME — votre site de contenu}"
SITE_DESC_EN="${8:-$SITE_NAME content website}"

TARGET="$PROJECTS_DIR/$PROJECT_DIR"
PROJECT_ID="$PROJECT_DIR"
TODAY=$(date +%Y-%m-%d)

# Derive locale from lang
case "$LANG" in
  fr) OG_LOCALE="fr_FR" ;;
  en) OG_LOCALE="en_US" ;;
  *) OG_LOCALE="${LANG}_${LANG^^}" ;;
esac

# --- Checks ---
if [ -d "$TARGET" ]; then
  echo "❌ Directory $TARGET already exists. Aborting."
  exit 1
fi

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "❌ Template not found at $TEMPLATE_DIR. Aborting."
  exit 1
fi

echo "🚀 Creating project: $SITE_NAME"
echo "   Directory: $TARGET"
echo "   App name:  $APP_NAME"
echo "   Domain:    $DOMAIN"
echo "   Language:  $LANG"
echo ""

# --- Copy template ---
cp -r "$TEMPLATE_DIR" "$TARGET"

# --- Rename app directory ---
mv "$TARGET/apps/{{app-name}}" "$TARGET/apps/$APP_NAME"

# --- Replace placeholders in all files ---
find "$TARGET" -type f \( -name "*.md" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" \
  -o -name "*.astro" -o -name "*.ts" -o -name "*.mjs" -o -name "*.js" -o -name "*.css" \
  -o -name "*.example" -o -name "Dockerfile" -o -name ".npmrc" \) | while read -r file; do
  sed -i \
    -e "s|{{project-id}}|$PROJECT_ID|g" \
    -e "s|{{project-dir}}|$PROJECT_DIR|g" \
    -e "s|{{app-name}}|$APP_NAME|g" \
    -e "s|{{domain}}|$DOMAIN|g" \
    -e "s|{{site-name}}|$SITE_NAME|g" \
    -e "s|{{lang}}|$LANG|g" \
    -e "s|{{og-locale}}|$OG_LOCALE|g" \
    -e "s|{{date}}|$TODAY|g" \
    -e "s|{{site-description}}|$SITE_DESC|g" \
    -e "s|{{site-description-en}}|$SITE_DESC_EN|g" \
    "$file"
done

# --- Create symlinks to shared skills ---
COMMANDS_DIR="$TARGET/.claude/commands"
mkdir -p "$COMMANDS_DIR"

for skill in provider.md write-article.md research.md seo-strategy.md editorial-plan.md generate-image.md cron.md; do
  if [ -f "$BRIDGE_COMMANDS/$skill" ]; then
    ln -sf "$BRIDGE_COMMANDS/$skill" "$COMMANDS_DIR/$skill"
  fi
done

# --- Setup .env and .mcp.json from examples ---
if [ -f "$TARGET/.env.example" ] && [ ! -f "$TARGET/.env" ]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  echo "📝 Created .env from .env.example (fill in your keys)"
fi

if [ -f "$TARGET/.mcp.json.example" ] && [ ! -f "$TARGET/.mcp.json" ]; then
  cp "$TARGET/.mcp.json.example" "$TARGET/.mcp.json"
  echo "📝 Created .mcp.json from .mcp.json.example (fill in your credentials)"
fi

# --- Initialize git ---
cd "$TARGET"
git init -q
git add -A
git commit -q -m "init: scaffold $SITE_NAME from template"

echo ""
echo "✅ Project created at $TARGET"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Fill in .provider/ files:"
echo "   - identity.md  (doctrine, ton, templates, scoring)"
echo "   - config.md    (structure, volumes, crons)"
echo "   - sources.md   (sources de recherche)"
echo "   - charte.md    (identité visuelle, palette, préfixe image)"
echo ""
echo "2. Fill in .env with API keys:"
echo "   - OPENAI_API_KEY"
echo "   - GOOGLE_SEARCH_CONSOLE_* credentials"
echo ""
echo "3. Fill in .mcp.json with correct credentials"
echo ""
echo "4. Add to Telegram Bridge registry:"
echo "   Edit ~/telegram-bridge/src/projects/registry.ts"
echo "   Add: { id: \"$APP_NAME\", prefix: \"$APP_NAME\", name: \"$SITE_NAME\", path: join(config.projectsDir, \"$PROJECT_DIR\"), emoji: \"$EMOJI\" }"
echo ""
echo "5. Customize the Astro app:"
echo "   - apps/$APP_NAME/src/lib/blog.ts (categories, sections)"
echo "   - apps/$APP_NAME/src/content.config.ts (schema)"
echo "   - apps/$APP_NAME/src/layouts/BaseLayout.astro (nav, footer)"
echo "   - apps/$APP_NAME/src/pages/ (section listing pages)"
echo ""
echo "6. Install dependencies & test:"
echo "   cd $TARGET && pnpm install && pnpm dev"
echo ""
echo "7. Create GitHub repo & push:"
echo "   gh repo create $PROJECT_DIR --private --source=. --push"
echo ""
echo "8. Deploy on Railway:"
echo "   Connect the GitHub repo and set PORT=8080"
