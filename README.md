# Backrooms — Liminal Escape

Jeu autonome d'exploration liminale en HTML5 : trois niveaux, inventaire, batterie, entites et fins multiples. Le jeu fonctionne hors ligne apres chargement et ne depend d'aucune bibliotheque externe.

## Jouer localement

```powershell
npm start
```

Ouvrir ensuite <http://127.0.0.1:4173>. Les touches ZQSD/WASD ou les fleches deplacent le personnage. Espace declenche l'impulsion de lampe lorsqu'elle est chargee. Une interface tactile est incluse.

## Verification

```powershell
npm test
```

Le controle valide la source restauree, la syntaxe JavaScript, le routage autonome et l'absence de dependances executables distantes.

## Provenance

La source a ete restauree le 25 aout 2026 depuis les cinq fragments publics `payload-00.txt` a `payload-04.txt` de `https://jeux-du-2-aout-2026.vercel.app/`, concatenee, decodee depuis Base64 puis decompressee avec GZip.

- Copie bit a bit : `source/restored-collection-index.html`
- Taille : `129619` octets
- SHA-256 : `eb0be8b6cae730acc0fabe669d7719c41ddea51bbb8f87f3212e944460988d2b`

Pour l'edition autonome, seule la route par defaut a ete adaptee afin d'ouvrir directement `liminal-escape`. La logique du jeu restaure n'a pas ete modifiee.
