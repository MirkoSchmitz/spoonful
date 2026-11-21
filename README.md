# Spoonful

Gemeinsames Kochbuch als Web-App (PWA) mit Supabase.

- `src/app.html` – App-Oberfläche (Quelle)
- `build.py` – erzeugt `public/index.html` aus `src/app.html` (+ PWA- und Supabase-Anbindung, Versionsnummer)
- `public/` – wird von Netlify ausgeliefert (siehe `netlify.toml`)
- `supabase/` – Datenbank-Schema und Edge Function für den Rezept-Import
- `ANLEITUNG.md` – Einrichtung von Supabase und Netlify

Änderungen: `src/app.html` bzw. `public/shim.js` anpassen, `python3 build.py` ausführen, committen und pushen – Netlify veröffentlicht automatisch.
