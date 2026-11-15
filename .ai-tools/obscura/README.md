# Obscura dans ce dépôt

Le skill officiel [Obscura](https://github.com/h4ckf0r0day/obscura) est inclus
dans ce dépôt pour l'automatisation de pages web, l'inspection du DOM,
les captures d'écran et les diagnostics de rendu.

## Utilisation par les agents

| Client | Skill du projet | Invocation explicite |
| --- | --- | --- |
| Codex CLI / extension IDE | `.agents/skills/obscura/SKILL.md` | `$obscura` ou sélection via `/skills` |
| Claude Code | `.claude/skills/obscura/SKILL.md` | `/obscura` |

Les deux fichiers sont des copies identiques, sans modification, du skill
amont épinglé au commit `0d9a2f764ffdb097269da048002c593865e83a9e`.
La licence Apache 2.0 est conservée dans chacun des deux dossiers.
Les copies physiques assurent aussi la compatibilité avec les checkouts Windows.

La découverte dépend du client et de ses réglages de confiance et de skills.
Les sessions Claude dans un fil cloud de projet ne chargent pas les skills
du dépôt ; cette intégration vise les sessions qui lisent les skills du projet.
La présence de ces fichiers ne prouve pas qu'un client les a chargés.

Exemple de demande :

> Utilise Obscura pour inspecter le menu de ce jeu sur mon serveur de développement,
> relever les erreurs de chargement et enregistrer une capture. Compare ensuite
> tout défaut visuel avec le navigateur utilisé par les tests du projet.

## Moteur à installer sur la machine d'exécution

Le skill fournit les instructions. Les programmes `obscura` et
`obscura-worker` restent des prérequis locaux ; ils ne sont pas des dépendances
du jeu et ne sont pas exécutés lors du build ou du déploiement Vercel.

Vérifier une installation existante :

```bash
obscura --version
```

Les archives officielles **v0.2.7** avec rendu, sans variante stealth, sont
référencées avec leur URL et leur SHA-256 dans [source.json](source.json).
Télécharger l'archive correspondant au système, contrôler son SHA-256,
puis extraire les fichiers dans un dossier d'outils dédié et ajouter ce dossier
au `PATH`. Conserver `obscura` et `obscura-worker` ensemble ; sous Windows,
conserver aussi les DLL livrées à côté des exécutables.

Sous Linux/macOS, calculer le SHA-256 avec `sha256sum NOM_ARCHIVE` ou
`shasum -a 256 NOM_ARCHIVE`. Sous PowerShell, utiliser
`Get-FileHash NOM_ARCHIVE -Algorithm SHA256`.
Comparer le résultat à l'entrée exacte de [source.json](source.json).

Une compilation depuis la source est également possible. Utiliser un checkout
séparé du jeu, positionné sur le commit épinglé, puis suivre le
[guide amont](https://github.com/h4ckf0r0day/obscura/blob/0d9a2f764ffdb097269da048002c593865e83a9e/README.md#build-from-source).
Ne pas lancer les commandes `cargo` du skill à la racine de ce jeu.

## Vérification d'une page

Pour une URL de jeu publiée que vous êtes autorisé à tester :

```bash
obscura fetch https://example.com --dump text
obscura fetch https://example.com --screenshot page.png
```

Remplacer l'URL par celle du jeu. Pour le serveur local de développement,
vérifier son port et utiliser l'exception de réseau privé sur cette commande :

```bash
obscura fetch http://127.0.0.1:3000 --allow-private-network --dump text
```

Cette option autorise aussi d'autres plages privées ; limiter son usage au
serveur de développement voulu et conserver la politique réseau de l'environnement.
Ne pas l'activer globalement.

## Articulation avec les outils existants

Obscura complète Spec Kit, Superpowers et Claude Code Game Studios. Les
instructions du projet, ses critères d'acceptation et ses tests restent la référence.
Pour un jeu, confirmer les comportements WebGL, audio, service worker, contrôles
et effets visuels dans le navigateur prévu par le projet : le moteur indépendant
d'Obscura peut produire un rendu et des API différents de Chromium.

Cette intégration ajoute uniquement le skill, sa licence et ses références.
Elle n'enregistre aucun serveur MCP, ne démarre aucun service, n'ajoute aucun
hook et ne modifie pas les permissions du client. Un usage MCP ultérieur peut
employer `obscura mcp` en stdio après installation du moteur et configuration
du client. Conserver ses réglages existants.

Le mode stealth reste une option amont ; il n'est pas activé par cette intégration.
Son existence ne change pas les autorisations d'accès aux sites ni les limites
réseau de l'environnement.

## Mise à jour

Comparer le nouveau skill et sa licence avec les sources épinglées, puis mettre
à jour les deux copies ensemble et les empreintes dans [source.json](source.json).
Une copie locale différente doit être examinée avant remplacement.

Sources de découverte :
[Codex](https://developers.openai.com/codex/skills) ·
[Claude Code](https://code.claude.com/docs/en/skills).
