# Carte du ciel · Club Astro Littoral

Application de carte du ciel pour les membres du club : préparer ses soirées
d'observation et suivre le ciel en direct, au télescope en visuel comme en
astrophoto grand champ.

**Ouvrir l'application :** https://timtimetre62.github.io/clubastrolittoral/

Elle s'installe comme une application sur Android, iPhone, PC et Mac
(menu du navigateur → « Ajouter à l'écran d'accueil » ou « Installer »)
et fonctionne ensuite hors connexion.

## Ce qu'elle fait aujourd'hui (étape 1)

- Carte du ciel interactive pour votre lieu et votre heure : 41 000 étoiles
  jusqu'à la magnitude 8, constellations et leurs noms en français.
- Soleil, Lune (avec sa phase) et planètes, positions calculées avec
  précession, nutation, aberration et parallaxe (bibliothèque astronomy-engine).
- Fiche de chaque astre : hauteur, azimut, coordonnées J2000 et de la date,
  lever, culmination, coucher.
- « Ce soir » : coucher du Soleil, crépuscules civil / nautique / astronomique,
  Lune, et tableau des planètes.
- Recherche (étoiles, constellations, planètes), voyage dans le temps,
  mode nuit rouge, lieu par GPS ou coordonnées.

## Étape 2 : catalogues et matériel

- Près de 16 000 objets du ciel profond : Messier, Caldwell, NGC, IC,
  Sharpless, Barnard, Lynds (LDN, LBN), van den Bergh, Collinder, Melotte,
  Trumpler, Stock, Ruprecht, RCW, Cederblad, Arp, nébuleuses planétaires (PK).
- Symboles à l'échelle et orientés (galaxies, amas, nébuleuses…), noms
  usuels en français pour les objets les plus connus, fiche détaillée.
- « Mon matériel » : instruments, oculaires, caméras et Barlow/réducteurs
  de chacun (enregistrés sur l'appareil) ; grossissement, pupille de sortie,
  champ, échantillonnage ; cadre de l'oculaire ou du capteur sur la carte.
- « Catalogues et objets » : choix des catalogues, modes « Visuel » (selon
  la magnitude limite de l'instrument) et « Astrophoto grand champ » (selon
  la taille du champ), liste des objets visibles triée par hauteur.

## Feuille de route

1. ✅ Carte du ciel de base
2. ✅ Catalogues et matériel (à venir : étoiles doubles, nébuleuses planétaires d'Abell)
3. Comètes, astéroïdes, novae/supernovae, ISS, mis à jour chaque jour ;
   liste « quoi observer ce soir »
4. Fonctions club (listes partagées, sites d'observation), puis pilotage GoTo

## Développement

```bash
npm install
npm run data   # prépare les données du ciel dans public/data
npm run dev    # serveur local
npm test       # tests des calculs astronomiques
npm run build  # version de production dans dist/
```

Chaque envoi sur `main` est testé puis mis en ligne automatiquement sur
GitHub Pages.

## Sources et licences des données

- Étoiles et constellations : [d3-celestial](https://github.com/ofrohn/d3-celestial)
  (licence BSD, © Olaf Frohn), d'après les catalogues Hipparcos et Tycho.
- Ciel profond : catalogue DSO de [Stellarium](https://github.com/Stellarium/stellarium)
  (licence GPL-2.0-or-later), compilé d'après SIMBAD, NED et les catalogues
  d'origine. Il est téléchargé au moment de la construction (`npm run data`).
- Calculs : [astronomy-engine](https://github.com/cosinekitty/astronomy)
  (licence MIT, © Don Cross).
