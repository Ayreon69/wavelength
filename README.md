# Wavelength

**Un indice. Un cadran. Toute la table qui débat.**

👉 **Jouer :** lien à venir (le service Render n'est pas encore créé)

Jeu multijoueur d'équipe en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Wavelength*, le jeu de Wolfgang Warsch, Alex Hague et Justin Vickers (projet de fans, non officiel, avec ses propres visuels et ses propres cartes).

## Règles en bref

- De 2 à 12 joueurs. À partir de 4, deux équipes, Corail et Lagon ; à 2 ou 3, tout le monde joue ensemble.
- À chaque manche, un **médium** choisit une carte qui oppose deux idées (*Froid ↔ Chaud*), puis découvre la cible, cachée au hasard sur le cadran.
- Il donne **un indice** : quelque chose qui, entre ces deux idées, tombe pile à cet endroit. Ensuite, il se tait.
- Son équipe **tourne l'aiguille** puis valide. Plus elle tombe près du centre de la cible, plus elle marque : 4, 3 ou 2 points.
- En équipes, **l'autre camp parie** : le centre de la cible est-il à gauche ou à droite de l'aiguille ? Un bon pari rapporte 1 point, sauf si l'aiguille est en plein centre.
- L'équipe qui joue en second part avec 1 point. Une équipe qui marque 4 points en restant derrière **rejoue aussitôt** avec un autre médium. La première à 10 points gagne ; en cas d'égalité, mort subite.
- **Tous ensemble**, on joue 7 cartes. Le plein centre vaut 3 points et rend une carte. Le score final reçoit une appréciation.

Les règles suivent celles du jeu de société : cadran, zones 4-3-2, pari gauche/droite, point de départ de la seconde équipe, rattrapage, victoire à 10, variante coopérative à 7 cartes.

Sont des choix de ce jeu :

- **Deux cartes au choix**, et autant d'autres que le médium veut, tant qu'il n'a pas vu la cible : il ne peut rien en tirer.
- **Toute l'équipe tient l'aiguille.** Chacun peut la tourner, tout le monde la voit bouger en direct, et elle se verrouille quand tous les présents ont validé la même position. La bouger annule les validations.
- **Le pari se fait d'un commun accord.** Avec le chrono, c'est la majorité qui l'emporte à la fin du temps, et une égalité vaut abstention.
- **Chrono facultatif**, réglé par l'hôte : 1 ou 2 minutes pour l'aiguille, puis 30 secondes pour le pari.
- **Le médium ne peut pas réagir** pendant que son équipe cherche : ses réactions sont coupées jusqu'au dévoilement.
- **Les équipes se forment seules** dans le salon, chacun peut changer de camp et l'hôte peut mélanger. Un retardataire rejoint l'équipe la moins nombreuse ; au-delà de 12 joueurs, on regarde.
- **On n'attend pas les absents** : au bout de 20 secondes de coupure, un joueur ne bloque plus les accords, et un médium absent passe la main à un coéquipier. Une équipe entièrement absente est attendue, sauf fin du chrono.
- **210 cartes écrites pour cette version**, en français, et non celles de la boîte. L'appréciation du score coopératif est formulée à notre façon.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Cadran dessiné en SVG : volet qui pivote pour dévoiler la cible, aiguille au doigt, à la souris ou au clavier
- Aiguille partagée en temps réel, avec le nom de celui qui la tourne
- Indice affiché en grand, conseils pour un bon indice
- Dévoilement en tampon (« Dans le mille ! ») et vibration propre à chaque résultat
- Fin de partie en confettis, avec le récapitulatif : chaque manche avec son mini-cadran, son indice et son pari
- Réactions et petites phrases (« Plus à gauche ! »), règles consultables en jeu
- Reprise automatique après une coupure
- Sons synthétisés, animations réduites si le système le demande
- Aucune aide au calcul : ni probabilité, ni historique pendant la partie

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3130
npm run dev:client   # interface sur http://localhost:5192
npm test             # zones, score, pari, rattrapage, mort subite, coopératif, absents, secrets
npm run build && npm run e2e   # deux parties complètes avec de vrais clients connectés
```

`WL_FAST=1` raccourcit le délai d'absence (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, constantes et calcul des zones
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), cartes (`spectra.ts`), table, équipes et minuteries (`room.ts`). Le serveur fait autorité : la cible ne sort que vers le médium, après son choix de carte, puis vers tous au dévoilement ; les cartes proposées ne sortent que vers lui. L'aiguille voyage par un message léger, l'état complet suit un quart de seconde plus tard
- `client/` : React + Vite + Framer Motion. Le cadran est dans `components/Dial.tsx`, la table dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
