# Daily Tracker

Ton suivi quotidien personnel : sommeil, humeur, sport, habitudes, journal…
Une application web installable sur téléphone (PWA), qui fonctionne hors-ligne
et garde tes données **sur ton appareil**. Objectif : être prêt pour 2027.

## Ce que fait l'application

- **Aujourd'hui** — remplis chaque métrique du jour en quelques touches
  (Oui/Non, note de 1 à 5 ou 1 à 10, compteur +/−, nombre avec unité, durée,
  heure, texte libre). Tout s'enregistre automatiquement. Navigation jour par
  jour pour rattraper un oubli, compte à rebours avant 2027 puis avancement de
  l'année.
- **Objectifs** — « au moins », « au plus », « avant 23:00 », « Oui »… Chaque
  carte indique si l'objectif du jour est atteint.
- **Tendances** — par métrique, sur 7 j / 30 j / 90 j / 1 an / année en cours :
  moyenne, min–max, total, % d'objectif atteint, série en cours et record,
  graphique interactif (survol ou flèches du clavier) et tableau des valeurs.
  Au-delà de 90 jours, le graphique montre des moyennes hebdomadaires.
- **Année** — « année en pixels » : un carré par jour, 12 mois × 31 jours, pour
  une métrique ou pour l'assiduité globale. Touche un jour pour l'ouvrir.
- **Réglages** — crée tes propres métriques ou pioche dans une bibliothèque
  (22 modèles), réordonne, archive (sans perdre l'historique), exporte en
  JSON (sauvegarde complète) ou CSV (Excel, Numbers, Google Sheets), importe
  une sauvegarde, thème clair/sombre.

## Appli Android et montre connectée

L'appli Android (dossier `android/`) contient la même application, plus une
synchronisation avec **Health Connect** : à chaque ouverture, elle lit tes **pas**
et ton **sommeil** (durée, heure de coucher et de réveil) écrits par l'appli de ta
montre — COROS, ou toute autre montre qui écrit dans Health Connect — et remplit les
métriques correspondantes.

1. Une fois pour toutes, crée le secret du dépôt `ANDROID_KEYSTORE_PASSWORD`
   (Settings → Secrets and variables → Actions → New repository secret) avec un mot de
   passe d'au moins 12 caractères, gardé dans ton gestionnaire de mots de passe. Il protège
   la clé qui signe l'APK (voir [`android/README.md`](android/README.md)).
2. Dans l'appli COROS : Profil → Réglages → Applications tierces → Health Connect,
   autorise *Pas* et *Sommeil*.
3. Sur ton téléphone, ouvre https://github.com/Gurvananas/daily-tracker/releases/latest,
   télécharge `daily-tracker.apk` et installe-le (autorise l'installation depuis ton
   navigateur quand Android le demande).
4. Dans l'appli : Réglages → *Montre connectée* → *Autoriser l'accès*.

Règles de la synchronisation :
- elle relit les 7 derniers jours à chaque ouverture (30 jours la première fois) ;
- le sommeil est rangé au jour du réveil ;
- une valeur modifiée à la main n'est jamais écrasée ; efface-la pour que la synchro
  la remplisse de nouveau ;
- dans Réglages → *Montre connectée*, tu choisis quelle métrique reçoit quelle donnée.

Les données de l'appli Android sont séparées de celles du navigateur : pour passer de
l'une à l'autre, exporte une sauvegarde JSON puis importe-la. L'APK est compilé et publié
par `.github/workflows/android.yml` à chaque push sur `main` (détails dans
[`android/README.md`](android/README.md)).

## Utiliser l'application

### En local

```bash
npm start          # → http://localhost:8080
npm test           # tests de la logique (dates, objectifs, statistiques, import/export)
```

L'appli web n'a aucune dépendance : c'est du HTML/CSS/JavaScript natif (modules ES).
Les paquets npm (`npm ci`) ne servent qu'à fabriquer l'appli Android.

### Sur ton téléphone (GitHub Pages)

1. Fusionne cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Source : GitHub Actions**.
   (Pages sur un dépôt privé nécessite un compte GitHub Pro ; sinon rends le
   dépôt public — tes données, elles, ne sont jamais dans le dépôt.)
3. Le workflow `.github/workflows/pages.yml` lance les tests puis publie le site
   à chaque push sur `main`. L'adresse apparaît dans l'onglet Actions.
4. Ouvre l'adresse sur ton téléphone puis :
   - **iPhone** : Safari → Partager → *Sur l'écran d'accueil* ;
   - **Android** : Chrome → menu → *Installer l'application*.

Tout autre hébergeur de fichiers statiques (Netlify, Cloudflare Pages…) convient
aussi : il suffit de servir `index.html`, `styles.css`, `sw.js`,
`manifest.webmanifest`, `icons/` et `src/`.

## Tes données

- Elles sont stockées dans le navigateur (`localStorage`), uniquement sur
  l'appareil utilisé. Rien n'est envoyé sur internet.
- Un téléphone et un ordinateur ont donc chacun leurs propres données : choisis
  un appareil principal (le téléphone, en général).
- **Fais des sauvegardes** : Réglages → *Exporter (JSON)*, une fois par mois par
  exemple. L'application te le rappelle si tu n'as pas sauvegardé depuis 30 jours.
  L'import peut *fusionner* (ajoute aux données existantes) ou *remplacer*.
- Installer l'app sur l'écran d'accueil protège mieux les données contre
  l'effacement automatique du navigateur (bouton « Protéger mes données »).

## Préparer 2027

D'ici le 1er janvier, utilise l'app quelques semaines pour roder ta liste :
garde 5 à 8 métriques que tu remplis vraiment, ajuste les objectifs, archive le
reste. Le jour J, la grille 2027 de l'onglet *Année* commencera à se remplir.

## Structure du code

```
index.html            coquille de l'app + barre d'onglets
styles.css            styles (thèmes clair et sombre)
sw.js                 service worker (fonctionnement hors-ligne)
manifest.webmanifest  installation PWA
src/
  app.js              routeur (#/today, #/stats, #/year, #/settings…)
  store.js            état + persistance localStorage
  data.js             schéma, validation, fusion d'imports, export CSV
  metrics.js          types de métriques, bibliothèque, objectifs, formats
  stats.js            moyennes, séries, niveaux de couleur (fonctions pures)
  charts.js           graphiques SVG et grilles de jours
  dates.js            dates locales « AAAA-MM-JJ »
  ui.js               petits utilitaires DOM, infobulles, notifications
  views/              écrans : today, stats, year, settings, editor, library
tests/                tests unitaires (node --test)
scripts/              serveur local, génération des icônes PNG
```

Dossiers ajoutés pour Android : `android/` (projet Capacitor + `HealthSyncPlugin.kt`),
`src/native.js` (pont vers le natif), `src/health.js` (synchronisation Health Connect),
`capacitor.config.json`. `npm run android:sync` copie l'appli web dans le projet Android.

Après une modification des fichiers de l'app, incrémente `CACHE` dans `sw.js`
(`daily-tracker-v2`, …) pour forcer la mise à jour du cache hors-ligne, et
ajoute tout nouveau fichier JS à la liste `SHELL`.
