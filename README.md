# Backrooms — Liminal Escape

Survival-horror liminal original en HTML5, conçu comme un jeu autonome et non comme une démo. Chaque descente génère trois zones connectées et lisibles, avec objectifs, ressources, IA à états, sauvegarde, checkpoints et fins multiples.

## Boucle de jeu

- Explorez des couloirs générés à partir d’une seed et révélez progressivement la carte.
- Restaurez les relais de chaque zone avant de rejoindre la sortie.
- Gérez santé, batterie, endurance, sang-froid et charge d’impulsion.
- Marchez, courez, accroupissez-vous ou cachez-vous : les menaces voient la lumière et entendent le bruit.
- Collectez piles, soins, calmants et trois notes facultatives.
- Débloquez trois issues victorieuses et deux issues d’échec dans les archives.

Trois difficultés adaptent vitesse, dégâts, consommation et ressources. La partie active est sauvegardée automatiquement, à chaque collecte, à chaque seuil et à la pause. Un checkpoint de début de zone reste disponible après un échec.

## Commandes

| Action | Clavier |
| --- | --- |
| Marcher | ZQSD, WASD ou flèches |
| Courir | Maj |
| S’accroupir | C |
| Interagir / se cacher | E |
| Lampe | F |
| Impulsion | Espace |
| Ressources | 1, 2, 3 |
| Pause | Échap |

Une interface tactile complète est affichée sur téléphone et tablette. Les options couvrent le volume, les sous-titres sonores, le mouvement réduit, la lisibilité renforcée, les secousses et la pause automatique.

## Développement

Prérequis : Node.js 20 ou plus récent.

```powershell
npm start
```

Le serveur local écoute sur `http://127.0.0.1:4173`.

```powershell
npm test
npm run build
```

Les tests couvrent la génération déterministe, la connectivité, les spawns, le pathfinding, les fins et la validation des sauvegardes. Le contrôle statique vérifie aussi les assets, la syntaxe, le manifeste et le précache PWA. Le build de production est écrit dans `dist/`.

## PWA et hors-ligne

Le manifeste fournit des icônes 192/512 et une variante maskable. Le service worker précache tout le shell du jeu et utilise `index.html` comme repli de navigation hors ligne. Aucun script, style, son ou asset distant n’est requis.

## Statut et provenance

Ce projet est un fan game indépendant et non officiel. Il ne reprend aucun asset officiel ni photographie connue. Le visuel d’accueil a été créé avec OpenAI pour ce projet; sa provenance est documentée dans `assets/README.md`. Les environnements, menaces, objets, effets et sons de jeu sont originaux et procéduraux.

La restauration historique du livrable du 2 août 2026 reste conservée, bit à bit, dans `source/restored-collection-index.html` (SHA-256 `eb0be8b6cae730acc0fabe669d7719c41ddea51bbb8f87f3212e944460988d2b`).
