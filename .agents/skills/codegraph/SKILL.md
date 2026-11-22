---
name: codegraph
description: Explorer localement symboles, flux d'appels et dépendances avec CodeGraph (MCP/CLI) pour préparer les changements, en complément des autres skills du dépôt.
---
# CodeGraph — navigation du code
Source officielle (MIT) : https://github.com/colbymchenry/codegraph

CodeGraph est un moteur de graphe de code **local** et un serveur MCP. La présence de ce skill n'installe ni le CLI, ni le serveur, ni l'index.

## Démarrage sur la machine de développement
- Installer le CLI suivant le README officiel (par exemple `npm install -g @colbymchenry/codegraph`).
- Lancer `codegraph install` **une fois** pour connecter les agents (Codex CLI, Claude Code, Cursor, Copilot, etc.) en préservant leur configuration existante.
- Dans **chaque clone de projet** : `codegraph init`, puis vérifier `codegraph status`. Ne jamais committer les index `.codegraph/` et `.codegraph-wsl/` ; les ajouter au `.gitignore` local si nécessaire.
- Pour les dépôts privés, option : `codegraph telemetry off` ou `CODEGRAPH_TELEMETRY=0`.

## Travail avec les skills existants
1. Lire `AGENTS.md`, `CLAUDE.md` et les autres compétences avant de décider d'un workflow.
2. Lorsqu'il est disponible et que l'index existe, préférer `codegraph_explore` (MCP) ou `codegraph explore "question"` (CLI) pour l'architecture, les relations entre symboles, les appels et l'impact des modifications.
3. En l'absence du CLI/MCP ou de l'index, ne pas inventer de sortie : utiliser les outils habituels. Si le CLI est installé et une indexation utile, exécuter `codegraph init`.
4. Garder Spec Kit pour les spécifications, Superpowers pour développement/QA, 3Dviz Pro Max pour la 3D et les autres skills spécialisés. Les tests, builds et revues restent nécessaires.
5. Après les changements, CodeGraph synchronise automatiquement sous session active ; vérifier avec `codegraph status`, ou `codegraph sync` si besoin. Après mise à jour du CLI, reconstruire via `codegraph index` si l'index est ancien.
