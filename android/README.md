# Appli Android

Projet [Capacitor](https://capacitorjs.com/) qui emballe l'appli web (`../src`, `../index.html`…)
et ajoute un module natif, `HealthSyncPlugin.kt`, qui lit dans **Health Connect** :

- les pas du jour (somme dédoublonnée par Health Connect selon la priorité des sources) ;
- la nuit qui se termine ce jour-là (sessions finissant entre 18 h la veille et 18 h) :
  durée réellement dormie (phases d'éveil exclues), heure de coucher et de réveil.

L'accès est en lecture seule (`READ_STEPS`, `READ_SLEEP`).

## Compiler

L'APK est compilé par GitHub Actions (`.github/workflows/android.yml`) et publié en
« release » à chaque push sur `main`. En local, avec le SDK Android et un JDK 21 :

```bash
npm ci
npm run android:sync        # copie l'appli web dans android/app/src/main/assets/public
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Clé de signature

Android n'installe une mise à jour par-dessus l'ancienne version (en gardant les données)
que si elle est signée avec **la même clé**. Aucune clé ni aucun mot de passe n'est écrit
en clair dans ce dépôt :

1. Le mot de passe est un secret GitHub du dépôt, `ANDROID_KEYSTORE_PASSWORD`
   (Settings → Secrets and variables → Actions → New repository secret), 12 caractères minimum.
   Garde-le dans ton gestionnaire de mots de passe : sans lui, impossible de publier une
   mise à jour installable par-dessus l'appli actuelle.
2. Au premier build qui trouve ce secret, le workflow crée la clé, la chiffre avec ce mot de
   passe (AES-256, PBKDF2 600 000 itérations) et ajoute le fichier chiffré
   `signing/release.p12.enc` au dépôt. Les builds suivants le déchiffrent pour signer l'APK.
3. Sans le secret, le workflow produit un APK de test signé avec une clé jetable, sans le
   publier.

Pour un build local signé : déchiffre la clé avec `openssl enc -d -aes-256-cbc -pbkdf2
-iter 600000 -in signing/release.p12.enc -out /tmp/release.p12`, puis lance Gradle avec
`ANDROID_KEYSTORE_FILE=/tmp/release.p12` et `ANDROID_KEYSTORE_PASSWORD=…`.
