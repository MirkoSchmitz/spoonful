# Spoonful als eigene App – Einrichtung

Damit läuft Spoonful als eigenständige App auf euren Handys, ohne claude.ai-Konto und mit eigenem Login per E-Mail und Passwort. Die Oberfläche ist dieselbe wie in der Testversion. Rechne mit etwa 20 Minuten. Alles läuft im kostenlosen Tarif.

## Was im Paket steckt

| Datei | Wofür |
|---|---|
| `public/` | Die fertige App. Dieser Ordner wird online gestellt. |
| `public/config.js` | Hier trägst du deine Supabase-Zugangsdaten ein (Schritt 4). |
| `supabase/schema.sql` | Datenbank, Zugriffsregeln, Foto-Speicher und Live-Abgleich |
| `supabase/functions/import-recipe/index.ts` | Rezept-Import per Link, Text oder Foto |
| `build.py` | Nur für mich zum Aktualisieren, du brauchst sie nicht |

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren und **New project** wählen.
2. Name `spoonful`, ein Datenbank-Passwort (gut aufheben) und als Region **Frankfurt (eu-central-1)** wählen.
3. Rund zwei Minuten warten, bis das Projekt bereit ist.

## 2. Datenbank einrichten

1. Links auf **SQL Editor** und dann **New query** klicken.
2. Den kompletten Inhalt von `supabase/schema.sql` einfügen und **Run** klicken. Am Ende sollte „Success“ stehen.

## 3. Anmeldung (E-Mail und Passwort)

Hier ist keine Einstellung nötig. Optional unter **Authentication → Sign In / Providers → Email** den Schalter **Confirm email** ausschalten. Dann entfällt nach dem Registrieren die Bestätigungsmail.

## 4. Zugangsdaten eintragen

1. **Project Settings → API** öffnen.
2. **Project URL** und den Schlüssel **anon public** kopieren.
3. Beides in `public/config.js` eintragen:
   ```js
   supabaseUrl: 'https://abcdefgh.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi…'
   ```
   Der anon-Schlüssel darf öffentlich sein. Eure Daten schützen die Regeln aus Schritt 2: Nur Mitglieder eines Kochbuchs sehen dessen Rezepte.

## 5. Import-Funktion (optional, aber empfohlen)

1. Links auf **Edge Functions**, dann **Deploy a new function → Via Editor**.
2. Die Funktion **genau** `import-recipe` nennen, den Inhalt von `supabase/functions/import-recipe/index.ts` einfügen und **Deploy** klicken.
3. **Import per Link** funktioniert damit sofort, wenn die Rezeptseite ihre Rezeptdaten mitliefert. Das tun fast alle großen Seiten, zum Beispiel Chefkoch, Lecker oder EatSmarter.
4. Für den Import aus **Text oder Foto** braucht die Funktion einen Claude-API-Schlüssel. Den bekommst du auf [console.anthropic.com](https://console.anthropic.com). Er kostet pro Import nur Bruchteile eines Cents, ist aber ein eigenes, kostenpflichtiges Konto. Eintragen unter **Edge Functions → Secrets**: Name `ANTHROPIC_API_KEY`, Wert = dein Schlüssel. Ohne Schlüssel funktionieren alle anderen Teile der App trotzdem.

## 6. App online stellen

**Am einfachsten mit Netlify Drop (ohne Konto-Einrichtung, ohne Programme):**
1. [app.netlify.com/drop](https://app.netlify.com/drop) öffnen.
2. Den Ordner `public` (mit deiner ausgefüllten `config.js`) in das Fenster ziehen.
3. Du bekommst sofort eine Adresse wie `https://xyz.netlify.app`. Ohne Konto bleibt sie nur kurz bestehen. Leg ein kostenloses Konto an, dann bleibt sie dauerhaft. Unter **Site settings** kannst du sie zum Beispiel in `spoonful-mirko.netlify.app` umbenennen.

**Oder mit Vercel:**
1. Kostenloses Konto auf [vercel.com](https://vercel.com) anlegen.
2. Im Terminal im Ordner dieses Pakets `npx vercel --prod` ausführen und den Fragen folgen. Die Einstellungen stehen bereits in `vercel.json`.

**Danach zurück zu Supabase:** Unter **Authentication → URL Configuration** die App-Adresse als **Site URL** eintragen und zusätzlich unter **Redirect URLs** hinzufügen.

## 7. Auf den Handys installieren

- **iPhone:** Die App-Adresse in **Safari** öffnen, auf **Teilen** tippen, dann **Zum Home-Bildschirm**.
- **Android:** Die Adresse in **Chrome** öffnen, das Menü (⋮) öffnen und **App installieren** wählen.

## 8. Loslegen

1. Du: Spoonful öffnen, **Neues Konto erstellen** wählen, E-Mail und Passwort eingeben. Dann **Neues Kochbuch anlegen**.
2. Oben auf **Kochbuch** tippen, dann **Einladungslink kopieren** und den Link deiner Freundin schicken.
3. Sie öffnet den Link, erstellt sich genauso ein Konto und tritt mit dem schon eingetragenen Code bei.
4. **Rezepte aus der Testversion übernehmen:** In der Testversion auf claude.ai ganz unten auf „Alle Rezepte als Sicherung kopieren“ tippen. Dann in der neuen App unter **Kochbuch → Rezepte aus der Testversion übernehmen** einfügen. Fotos werden dabei nicht übernommen.

## Gut zu wissen

- **Kostenloser Tarif:** Supabase pausiert Projekte, die eine Woche lang gar nicht genutzt wurden. Mit einem Klick im Dashboard läuft es wieder, und es gehen keine Daten verloren.
- **Offline:** Die zuletzt geladenen Rezepte lassen sich auch ohne Netz lesen. Änderungen brauchen eine Verbindung.
- **Updates:** Wenn ich die App weiterentwickle, bekommst du einen neuen `public`-Ordner. Deine `config.js` behältst du einfach und ziehst den Ordner erneut in Netlify Drop bzw. führst `npx vercel --prod` aus.
