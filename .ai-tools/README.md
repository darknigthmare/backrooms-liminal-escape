# Outils IA du dépôt

Ce dépôt peut utiliser **GitHub Spec Kit**, **Superpowers** et, avec **Claude Code**, **Claude Code Game Studios**. Les consignes du projet et les demandes de l'utilisateur restent la référence. Les points d'entrée se trouvent dans `AGENTS.md` et `CLAUDE.md` à la racine.

Les références, versions et révisions vérifiées le **4 novembre 2026** sont consignées dans [sources.json](sources.json). Leur présence dans GitHub rend cette intégration disponible ; elle ne prouve pas qu'un plugin ou un client est installé sur la machine.

| Outil | Rôle dans ce projet | Activation |
| --- | --- | --- |
| [Spec Kit](https://github.com/github/spec-kit) | Définir une évolution précise, son plan et ses tâches | Préparer puis appliquer les fichiers pour Codex et Claude Code |
| [Superpowers](https://github.com/obra/superpowers) | Implémentation, diagnostic, revue et vérification | Installer le plugin dans le client utilisé |
| [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | Agents et compétences spécialisés dans les jeux | Préparer puis appliquer les fichiers utiles à Claude Code |

## Vérifier l'état local

Depuis la racine du dépôt :

```bash
python3 .ai-tools/setup.py doctor
```

Sous Windows, `py -3` peut remplacer `python3`. Git for Windows fournit Bash lorsque les outils en ont besoin.

Le diagnostic fonctionne **hors ligne**, sans téléchargement ni modification du projet. Il distingue les exécutables disponibles, les fichiers de préparation déjà présents et les compétences détectées. La présence d'un dossier, d'une référence ou d'un exécutable ne certifie pas que le client a chargé son plugin : vérifier aussi dans ce client.

## Réutiliser le travail existant

- Lire les instructions du dépôt et du sous-dossier concerné avant de commencer.
- Reprendre les spécifications, plans, listes de tâches et décisions déjà présents. Relier leurs chemins aux nouveaux travaux plutôt que produire des plans concurrents.
- Employer Spec Kit pour cadrer la prochaine évolution délimitée ; employer les compétences pertinentes de Superpowers pour la réaliser et la vérifier.
- Sous Claude Code, ajouter les compétences de Game Studios utiles au sujet : gameplay, moteur, niveau, interface, assets, audio ou QA. Dans un dépôt sans jeu, leur utilisation reste facultative et dépend de la tâche.
- Adapter la vérification au changement et aux exigences du projet. Documenter les commandes réellement exécutées et les limites observées.
- Conserver les choix et autorisations déjà donnés par l'utilisateur. Un modèle externe ne doit pas introduire une nouvelle demande d'approbation générique pour une action déjà autorisée. Les contrôles réels du client et les règles applicables restent en vigueur.

Cette répartition est une convention de ce dépôt. Les trois projets externes ne constituent pas un système unique dont l'interopérabilité serait automatiquement assurée.

## Spec Kit : préparer la prochaine évolution

Prérequis : Python 3.11 ou ultérieur, Git et `uv`/`uvx`. La préparation utilise le CLI et ses modèles à la révision indiquée dans `sources.json`. Les dépendances téléchargées ne constituent pas un environnement entièrement verrouillé.

Choisir un **nouveau dossier de préparation**, de préférence en dehors du dépôt :

```bash
python3 .ai-tools/setup.py spec-kit --prepare ../ai-stage-spec-kit
```

La préparation initialise les intégrations Codex et Claude Code dans ce dossier. Elle laisse les fichiers du projet en place et désactive la création des intégrations par événements. Si `.specify/` existe déjà dans le projet, reprendre cette installation : le préparateur refuse de la réinitialiser.

Le dossier obtenu contient les fichiers proposés et la licence MIT de Spec Kit :

- `files/` : les fichiers proposés, avec leurs chemins relatifs au dépôt ;
- `stage.json` : leur provenance et leurs empreintes de contrôle.

Examiner ce contenu, puis l'appliquer dans le cadre du travail autorisé :

```bash
python3 .ai-tools/setup.py apply --from ../ai-stage-spec-kit
python3 .ai-tools/setup.py doctor
```

Après chargement des compétences par le client, utiliser la séquence correspondant à l'évolution demandée :

| Étape | Codex | Claude Code |
| --- | --- | --- |
| Besoin et critères de réussite | `$speckit-specify` | `/speckit-specify` |
| Plan technique | `$speckit-plan` | `/speckit-plan` |
| Tâches réalisables | `$speckit-tasks` | `/speckit-tasks` |
| Implémentation | `$speckit-implement` | `/speckit-implement` |

Ces noms sont ceux des intégrations vérifiées de Spec Kit 1.3.0. Les saisir dans l'assistant, pas dans un terminal système. Donner le périmètre concret, les contraintes du dépôt et les chemins des documents existants. Si le besoin est déjà spécifié, reprendre à l'étape utile.

## Superpowers : activer le plugin du client

### Avec Codex

Dans **Codex App**, ouvrir **Plugins**, rechercher **Superpowers**, puis l'installer. Dans **Codex CLI**, ouvrir `/plugins`, rechercher `superpowers`, puis sélectionner **Install Plugin**.

Le présent ajout au dépôt ne réalise pas cette installation personnelle. Utiliser les compétences découvertes par le client après activation. Les anciennes instructions fondées sur un bootstrap `.codex` ou un lien global vers `~/.agents/skills` ne sont pas la méthode recommandée par le README amont vérifié.

### Avec Claude Code

Depuis la racine du projet, les commandes officielles suivantes installent le plugin à la portée du projet :

```bash
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install superpowers@claude-plugins-official --scope project
claude plugin list
```

Le marketplace de l'auteur constitue une autre source prise en charge :

```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace --scope project
```

Choisir une seule source et conserver celle déjà utilisée par le projet. Une entrée `enabledPlugins` dans `.claude/settings.json` indique une configuration partagée ; elle ne télécharge pas le plugin pour chaque personne. L'installation doit être vérifiée sur la machine concernée. Les versions des marketplaces peuvent évoluer indépendamment de la révision documentée ici.

Pour une session utilisant exactement la révision vérifiée, une autre possibilité est de conserver un checkout externe dédié :

```bash
git clone https://github.com/obra/superpowers.git ../superpowers-pinned
git -C ../superpowers-pinned checkout --detach 22f0b463e7a5e579904dd6211a520321035526f7
git -C ../superpowers-pinned rev-parse HEAD
claude --plugin-dir ../superpowers-pinned
```

Utiliser un nouveau dossier et comparer la révision affichée à `sources.json`. Le chargement par `--plugin-dir` est une alternative pour cette session ; éviter de charger simultanément une seconde copie du même plugin. Aucun fichier du projet n'est à remplacer par ceux de Superpowers.

Les sessions Claude hébergées dans le cloud ne chargent pas nécessairement les plugins déclarés dans les réglages du dépôt. La documentation Claude vérifiée précise que les sessions cloud ne chargent pas les plugins simplement activés par `.claude/settings.json` : vérifier les capacités effectives de l'environnement utilisé.

## Claude Code Game Studios : adoption d'un projet existant

Ce framework est un **modèle de projet et un ensemble de compétences Claude Code**, pas un plugin de marketplace. Son URL ne doit donc pas être ajoutée comme marketplace Claude.

Préparer les fichiers depuis sa révision verrouillée :

```bash
python3 .ai-tools/setup.py claude-studio --prepare ../ai-stage-claude-studio
```

Le préparateur rassemble les agents, compétences, documents, scripts et helpers de `.claude/`, les références moteur dans `docs/engine-reference/`, le catalogue de validation `studio-tests/`, quatre documents de support et la licence amont. Les documents de support sont `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md`, `docs/WORKFLOW-GUIDE.md`, `docs/skill-flow-diagrams.md` et `docs/migration-guide-v1.1.md`. Les helpers sont nécessaires : plusieurs compétences appellent directement ces chemins.

L'intégration conserve le `CLAUDE.md`, le `project.yaml` et le `.claude/settings.json` du projet. Elle ne copie pas les règles amont et n'active pas automatiquement de hooks d'événement. Les fichiers de support présents sous `.claude/hooks/` ne suffisent pas à activer ces événements. Cette sélection rend les agents, compétences et helpers disponibles ; elle ne reproduit pas toutes les politiques du modèle complet. Les standards du projet existant s'appliquent aux références à des règles amont non importées.

```bash
python3 .ai-tools/setup.py apply --from ../ai-stage-claude-studio
python3 .ai-tools/setup.py doctor
```

Dans Claude Code, reprendre le projet avec ses instructions existantes. Les compétences `/project-stage-detect` et `/adopt` permettent d'examiner le stade du projet et les adaptations utiles. Identifier le moteur réel : un jeu web maison ne devient pas un projet Godot, Unity ou Unreal du fait de cet ajout. Lire les constats avant de choisir une modification de configuration. Réserver `/start` à une initialisation réellement nécessaire, en tenant compte des informations déjà disponibles.

Le framework peut proposer des structures ou réglages de jeu supplémentaires. Les introduire selon le besoin du projet, sans remplacer les choix du moteur, les documents ni le suivi déjà établis. Pour un dépôt qui utilise déjà Game Studios, conserver sa configuration et rapprocher les différences par une modification normale du code.

## Application, conflits et mises à jour

`apply` vérifie les empreintes du dossier préparé et les destinations avant les copies. Un fichier identique est conservé. Une destination qui contient des données différentes bloque l'application entière : résoudre ce conflit explicitement dans le travail en cours, puis préparer une nouvelle étape cohérente. L'outil n'écrase pas silencieusement les personnalisations.

Les dossiers de préparation peuvent rester en dehors du dépôt ; ils n'ont pas à être ajoutés à Git. Les fichiers effectivement adoptés et les modifications intentionnelles du projet sont ceux à examiner et à versionner.

Pour une mise à jour, consulter les changements amont, modifier volontairement les révisions de `sources.json`, puis préparer et vérifier les différences. Refaire un diagnostic local après application et confirmer les compétences chargées dans le client. Ce guide ne configure ni mise à jour automatique, ni CI, ni déploiement du jeu.

## Vérifier l'assistant d'activation

La suite fournie contrôle les collisions, la conservation des fichiers existants,
les empreintes, les chemins autorisés et le diagnostic sans modification :

```bash
python3 -B -m unittest discover -s .ai-tools/tests -v
```

Ces tests vérifient l'assistant local. Ils ne certifient pas le chargement des
plugins dans un client ni le gameplay du projet.

## Sources et licences

- [Spec Kit : README](https://github.com/github/spec-kit), version 1.3.0.
- [Superpowers : README](https://github.com/obra/superpowers) et [version 7.0.2](https://github.com/obra/superpowers/releases/tag/v7.0.2).
- [Claude Code Game Studios : README](https://github.com/Donchitos/Claude-Code-Game-Studios), version 1.2.0.
- [Claude Code : installation et portée des plugins](https://code.claude.com/docs/en/discover-plugins).
- [Claude Code : réglages `enabledPlugins` et `extraKnownMarketplaces`](https://code.claude.com/docs/en/settings-reference).
- [Claude Code : sources de plugins et révisions verrouillées](https://code.claude.com/docs/en/plugins/marketplace-reference).

Ces trois projets utilisent une licence MIT. Conserver leurs mentions de licence lors de la copie de leurs fichiers. Les adresses exactes des sources à la révision vérifiée figurent dans [sources.json](sources.json).
