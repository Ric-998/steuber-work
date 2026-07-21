# SteuberWork – Projektübersicht

**SteuberWork** ist eine mobile PWA für das interne Auftragsmanagement der *Steuber Dienstleistungen GmbH*. Zielgruppe: Geschäftsführer Till (Admin) und seine Reinigungsmitarbeiter.

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend / DB | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Styling | Inline-Styles mit CSS-Variablen (kein CSS-Framework) |
| Icons | Material Symbols Outlined (Google Fonts) |
| Schriften | Manrope (Headlines), Inter (Fließtext) |
| Deployment | Netlify (`steuberwork.netlify.app`) |
| Push | Web Push API (VAPID) via `web-push` + Supabase Edge Function |

---

## Rollen & Views

Die App rendert je nach Rolle automatisch die passende View (Admin, Mitarbeiter, Teamleiter, Support):

### Admin (Till)
`src/pages/Dashboard.tsx` – responsive (Desktop-Sidebar + Mobile-Tabs), 8 Tabs:
- **Übersicht**: KPI-Kacheln (Tagesstatus, Probleme, Erledigte diese Woche); Probleme-Sektion direkt inline auf der Seite (kein Popup); Bento-Kacheln klickbar → navigieren zum Tagesbericht-Tab; Tagesbericht-Vorschau
- **Objekte**: Liste aller Objekte mit Server-Suche (ab 2 Zeichen, 350ms debounce), Gruppierung (keine/Stadt/Kunde); Detail-View (`ObjectDetail`) mit variantA-Design (Header mit Typ-Badge + Adresse, 2-Spalten-Grid Kunde+Ansprechpartner, Leistungen nach Frequenz gruppiert, Nächste Termine nach Datum gruppiert, Kunden-Name klickbar → navigiert zu KundeDetail), F5-stabile URL-Hash-Navigation
- **Kunden**: Kundenliste mit Server-Suche; `KundeDetail` mit modernisierter UI (Icon-Header, uniforme Listenzeilen für Telefon/Mail/Adresse, Objekt-Liste); Privatpersonen editierbar
- **Ansprechpartner**: Globale Kontaktliste mit Server-Suche; Edit + Delete (Änderung propagiert zu allen verknüpften Objekten); Privatpersonen aus dieser Liste bearbeitbar
- **Tagesbericht**: Tagesprotokoll, Auswertung abgeschlossener Aufgaben mit Fotos; FK-Disambiguation: `users!user_id` (nicht `users`) wegen zwei FKs in `task_assignments`
- **Nachrichten**: Chat-Funktion
- **Team**: Mitarbeiter einladen (per E-Mail über Edge Function), manuell anlegen (per `create-user-direct`), Team-Liste mit Aktiv/Inaktiv-Toggle, Urlaubssperren verwalten
- **Profil**: Abmelden, Einstellungen

### Mitarbeiter
`src/pages/TaskList.tsx` – 3 Tabs:
- **Aufgaben**: Wochenkalender (scrollbar), gefilterte Tagesliste nach Objekt gruppiert, Status-Update (offen → in_arbeit → erledigt/problem), Foto-Upload beim Abschluss
- **Zeitplan**: Urlaubsantrag, Krankmeldung, Verlauf der Anträge (Verfügbarkeit als Platzhalter für Phase 3)
- **Profil**: Push-Benachrichtigungen ein/aus, App-Tour, PWA-Installationsanleitung, Bug melden, Abmelden

### Teamleiter
`src/pages/TeamleiterDashboard.tsx` – responsive (Desktop-Sidebar + Mobile-Bottom-Nav), 5 Tabs:
- **Übersicht**: KPI-Kacheln (Aufgaben heute, In Arbeit, Erledigt, Probleme); Probleme-Liste; alle heutigen Aufgaben des Teams
- **Aufgaben**: alle Tasks seiner Objekte (gruppiert nach Objekt); Mitarbeiter einteilen; Vertretung setzen (`substitute_id` + Status `vertretung`)
- **Objekte**: nur seine Objekte (`objektleiter_id = userId`), lesende Detailansicht (Leistungen + kommende Termine)
- **Team**: aus Zuweisungen abgeleitete Mitarbeiter; Abwesenheiten (Krankmeldung/Urlaub aus `leave_requests`); Fahrzeit-Summe (`travel_minutes`); Stunden als Platzhalter
- **Profil**: identisch mit MA-Profil (Meine Daten, Passwort, Feedback, Abmelden)

Zuweisung: Admin setzt `objektleiter_id` je Objekt – Dropdown in `EditObjectOverlay` + Inline-Dropdown im ObjectDetail-Header. Rechte über RLS (`objektleiter_*`-Policies auf objects/tasks/task_assignments; zusätzlich Rollen-String `teamleiter` in 2 Policies auf task_assignments/task_reports).

---

## Datenmodell (Supabase)

| Tabelle | Beschreibung |
|---|---|
| `roles` | admin, mitarbeiter, teamleiter |
| `users` | Mitarbeiterprofile (full_name, phone, role_id, is_active, is_onboarded, **must_change_password**) |
| `customers` | Kunden / Hausverwaltungen (customer_type: privatperson \| firma \| weg-verwaltung \| mietverwaltung) |
| `objects` | Gebäude/Objekte mit Adresse, verknüpft mit customer; `object_type`, `objektleiter_id` (Spaltenname bleibt, im UI „Teamleiter") |
| `categories` | Aufgabenkategorien mit Emoji (Gebäudereinigung, Sanitär, Glas, …) |
| `tasks` | Aufgaben mit Intervall (täglich/wöchentlich/monatlich/quartalsweise/einmalig), due_date, end_date, default_assignee |
| `task_assignments` | Konkrete Zuweisung pro Tag; Status: offen/in_arbeit/erledigt/problem/vertretung; hat zwei FKs zu `users` (`user_id` + `substitute_id`) → PostgREST-Joins immer mit `users!user_id(...)` disambiguieren |
| `task_reports` | Abschlussberichte mit Foto-URLs (Storage: `task-photos`) und Notiz |
| `leave_requests` | Urlaubs- und Krankmeldungen; Status: ausstehend/genehmigt/abgelehnt |
| `vacation_blackouts` | Urlaubssperren (from_date, to_date, reason, created_by) |
| `contact_persons` | Ansprechpartner; verknüpft über `object_id` oder `customer_id`; normalisiert (eine Zeile → alle Objekte) |
| `contracts` | Verträge (type: jahresvertrag \| einmalig), verknüpft mit object + customer |
| `object_tokens` | Tokens für Kunden-Statusseite (kein Login nötig) |
| `push_subscriptions` | VAPID-Subscriptions pro User |
| `bug_reports` | In-App Fehlerberichte |

RPC: `get_my_profile()` (gibt `must_change_password` zurück), `get_dashboard_stats()`, `get_dashboard_problems()`

---

## Mitarbeiter-Onboarding (3 Methoden)

| Methode | Flow | Passwort |
|---|---|---|
| **E-Mail-Einladung** | `invite-user` Edge Function → MA erhält E-Mail → `RegisterPage` | MA setzt eigenes Passwort |
| **Link-Share** | `invite_tokens` Tabelle → Share-Link → `RegisterPage` | MA setzt eigenes Passwort |
| **Manuell anlegen** | Admin füllt Formular → `create-user-direct` Edge Function → Temp-PW wird angezeigt | Admin teilt Temp-PW → MA muss beim ersten Login Passwort ändern (`must_change_password = true`) |

---

## Auth-Flow & Passwort-Reset

`src/App.tsx` enthält:
- `onAuthStateChange` mit `PASSWORD_RECOVERY`-Handler: Falls Supabase dieses Event sendet (User hat Reset-Link geklickt), wird sofort `ChangePasswordOverlay` gezeigt
- Nach Login: Falls `profile.must_change_password === true`, erscheint ebenfalls `ChangePasswordOverlay` (Methode 3 / Temp-PW)
- `ChangePasswordOverlay`: Passwort-Eingabe (2×) mit Stärke-Chips, setzt nach Erfolg `must_change_password = false` in DB
- `SetupProfileOverlay`: Erscheint bei E-Mail-Einladung wenn `is_onboarded === false`

---

## Supabase Edge Functions

| Function | Zweck |
|---|---|
| `invite-user` | Admin-only: schickt Einladungs-E-Mail per `inviteUserByEmail`, legt Profil mit Rolle an |
| `create-user-direct` | Admin-only: legt MA-Account mit Temp-PW an (kein E-Mail-Versand), setzt `must_change_password = true` |
| `send-push` | Sendet Web-Push-Benachrichtigungen an Mitarbeiter (**TODO S1: noch ohne Auth, vor Go-Live absichern**) |
| `generate-assignments` | Cron: generiert `task_assignments` vorausschauend (rolling horizon) |
| `get-object-status` | Öffentliche Objekt-Statusseite für Kunden (via Token) |
| `cal-feed` | iCal-Feed-Export |
| `optimize-route` | Routen-Optimierung (vorbereitet) |

---

## Wichtige Dateien

```
src/
  App.tsx                      # Auth-Gate, Rollenweiche, ChangePasswordOverlay, SetupProfileOverlay; DEV_MODE = false
  pages/
    Dashboard.tsx              # Admin-View (~8900 Zeilen); alle Tabs + Overlays
    TaskList.tsx               # Mitarbeiter-View (inkl. ZeitTab, ProfileTab)
    Login.tsx                  # Login-Page (inkl. Passwort-Vergessen-Flow)
    CustomerStatusPage.tsx     # Öffentliche Kunden-Statusseite (via ?view=TOKEN)
    TeamleiterDashboard.tsx    # Teamleiter-View (5 Tabs: Übersicht, Aufgaben, Objekte, Team, Profil)
    SupportDashboard.tsx       # Support-View
    RegisterPage.tsx           # Registrierung per Einladungs-Token (E-Mail + Link-Share)
  components/
    BugReport.tsx              # In-App Bug-Meldeformular
    Chat.tsx                   # Nachrichten-Komponente
    ErrorBoundary.tsx          # Globaler Fehler-Fallback
    FeedbackSheet.tsx          # Feedback-Formular
    MapView.tsx                # Leaflet-Karte (vorbereitet, noch nicht voll integriert)
    ObjectDetail.design.tsx    # Design-Referenz für ObjectDetail (// @ts-nocheck, nicht importiert)
    OnboardingTour.tsx         # Interaktiver App-Rundgang + InstallGuide
    PWAInstallBanner.tsx       # PWA-Installations-Banner
    QRCode.tsx                 # QR-Code-Generator je Objekt
    WasIstNeu.tsx              # "Was ist neu"-Changelog-Sheet
  lib/
    supabase.ts                # Supabase-Client
    push.ts                    # Service Worker Registrierung + VAPID Push
  types/index.ts               # Alle TypeScript-Interfaces
  styles/global.css            # CSS-Variablen (--pri, --bg, --surf-*, --ok, --err, …)
supabase/functions/
  invite-user/index.ts
  create-user-direct/index.ts
  send-push/index.ts
  generate-assignments/index.ts
  get-object-status/index.ts
  cal-feed/index.ts
  optimize-route/index.ts
public/
  sw.js                        # Service Worker für Push + PWA
  manifest.json                # PWA-Manifest
```

---

## Dashboard.tsx – Interne Struktur (wichtig für Edits)

Die Datei ist ~8900 Zeilen lang. Wichtige Funktionen:

| Funktion | Beschreibung |
|---|---|
| `Dashboard` (default export) | Hauptkomponente; State, loadAll, Realtime, Tab-Rendering |
| `loadAll()` | Lädt alle Daten mit `.limit(200/300)`; Server-Suche je Tab |
| `loadDailyReport()` | Lädt Tagesbericht; Join: `users!user_id(id,full_name)` (FK-disambiguiert) |
| `ObjectDetail` | Objekt-Detailansicht; variantA-Design; Kunden-Name klickbar → KundeDetail; URL-Hash-Navigation |
| `KundeDetail` | Kunden-Detailansicht; modernes Design: Icon-Header + uniforme Listenzeilen |
| `EditObjectOverlay` | Objekt bearbeiten |
| `KundenList` | Kundenliste mit Server-Suche |
| `AnsprechpartnerList` | Globale Kontaktliste; Edit+Delete; Privatpersonen editierbar |
| `EditTaskOverlay` | Aufgabe bearbeiten; kompakter Header mit 3-Dot-Menü (Stornieren, Löschen, Als Vorlage) |
| `CreateTaskOverlay` | Neue Aufgabe anlegen (3-Step) |

**Achtung:** Das `Edit`-Tool ist auf dem OneDrive-Pfad geblockt. Alle Änderungen an `Dashboard.tsx` (und anderen Dateien im Projektordner) müssen per `python3`-Skript via Bash (String-Replacement) erfolgen.

---

## URL-Hash-Navigation

Die Admin-App nutzt `window.location.hash` zur Zustandspersistenz:
- Tab-Wechsel → `#tabname`
- Objekt geöffnet → `#objekte/UUID`
- Kunde geöffnet → `#kunden/UUID`
- F5 / Reload stellt den Zustand nach `loadAll()` wieder her

---

## Skalierung & Performance

- `loadAll()`: Haupttabellen mit `.limit(200/300)` abgesichert
- Server-Suche (350ms debounce, ab 2 Zeichen) in: Objekte, Kunden, Ansprechpartner
- `ObjectDetail`: Leistungen nach Frequenz gruppiert; Nächste Termine filtert inaktive Tasks heraus

---

## Bekannte Fallstricke

- **PostgREST FK-Ambiguität**: `task_assignments` hat zwei FKs auf `users` (`user_id` + `substitute_id`). Joins immer explizit disambiguieren: `.select('...,users!user_id(id,full_name)')` – sonst liefert PostgREST still `null`
- **Zsh History-Expansion**: `!` in doppelt-gequoteten git-Commit-Nachrichten gibt Fehler. Single-Quotes verwenden.
- **`.git/index.lock`**: VM-Bash und Mac-Git greifen auf denselben OneDrive-Sync-Ordner zu → git-Kommandos nur auf dem Mac ausführen, nicht via Bash im VM

---

## Offene Punkte / bekannte TODOs

- **S1 Security (vor Go-Live)**: `send-push` Edge Function hat noch keine Auth-Prüfung → absichern bevor live auf finalem Host
- **MapView**: Leaflet-Abhängigkeit vorhanden, SVG-Platzhalter wird noch gerendert
- **Verfügbarkeitsplanung**: Phase 3 – UI-Platzhalter vorhanden
- **Vertretungs-Anfrage**: Status `vertretung` definiert, UI-Flow fehlt noch
- **Teamleiter-Rolle**: `TeamleiterDashboard.tsx` mit 5 Tabs implementiert; DB-Rolle `objektleiter`→`teamleiter` umbenannt (inkl. RLS-Policies)

---

## Teamleiter-Rolle (implementiert – Juli 2026)

> ✅ **Umgesetzt:** DB-Rolle `objektleiter`→`teamleiter` (roles-Tabelle + 2 RLS-Policies), alle Rollenwerte/Labels im Code auf „Teamleiter", `TeamleiterDashboard.tsx` mit 5 Tabs, Teamleiter-Dropdown in `EditObjectOverlay` (+ objektleiter_id im Save). Spalte `objektleiter_id` unverändert. Offen: eigene Teamleiter-Accounts anlegen, Sparten-Zuordnung, Stunden-Erfassung.

### Umbenennung
Rolle `objektleiter` → `teamleiter` (DB + UI). Spalte `objektleiter_id` auf `objects` bleibt, heißt im UI "Teamleiter".

### Zuweisung: Objekt → Teamleiter
- Admin weist jedem Objekt **einmalig** einen Teamleiter zu (Dropdown in `EditObjectOverlay`)
- Danach automatisch: jede Aufgabe für Objekt X erscheint im Dashboard von Teamleiter X
- Keine Regions-/Stadtlogik – direkte 1:1-Zuweisung pro Objekt
- Bei Teamleiter-Wechsel reicht eine Änderung im Objekt

### Sparten (Steuber hat 2 Bereiche)
- **Grünanlagen**: 1 Teamleiter (aktuell für alle Orte)
- **Reinigung**: 2 Teamleiter – aufgeteilt nach Objektzuordnung (nicht nach Region-Regel)

### Dashboard-Tabs (5)
1. **Übersicht** – heutige Aufgaben des Teams, Probleme, Erledigte
2. **Aufgaben** – alle Tasks seiner Objekte; Mitarbeiter zuweisen, Vertretungen setzen
3. **Objekte** – nur seine Objekte (lesend, ObjectDetail-Ansicht)
4. **Team** – nur seine Mitarbeiter; Stunden + Krankmeldungen sehen
5. **Profil** – identisch mit MA-Profil-Tab

### Rechte
| Aktion | Teamleiter | Admin | MA |
|---|---|---|---|
| Aufgaben anlegen | ✅ (nur seine Objekte) | ✅ | ❌ |
| Aufgaben zuweisen / Vertretung | ✅ | ✅ | ❌ |
| Urlaub genehmigen | ❌ | ✅ | ❌ |
| MA-Stammdaten bearbeiten | ❌ | ✅ | ✅ (nur eigene) |
| Objekte / Kunden bearbeiten | ❌ | ✅ | ❌ |
| Neue MA einladen | ❌ | ✅ | ❌ |
| Tagesbericht seines Teams sehen | ✅ | ✅ | ❌ |
| Selbst als MA Aufgaben erledigen | ✅ | – | ✅ |

### Stunden & Fahrzeit
- MA trägt Arbeitsstunden **und Fahrzeit** manuell ein (pro Tag oder bei Task-Abschluss)
- Perspektivisch: automatische Berechnung aus Task-Status (Datenstruktur so anlegen, dass das möglich ist)
- Teamleiter sieht Stunden seines Teams zur Kontrolle

### Noch offen / spätere Phase
- Personalfragebogen beim Onboarding (MA füllt eigene Daten aus)
- Periodische Datenbestätigung (alle paar Monate: MA bestätigt dass Daten noch stimmen)
- Gehalt-Feld: nur Admin sichtbar/bearbeitbar (noch nicht implementiert)
- Detailklärung MA-Stammdaten: was genau darf Admin vs. MA bearbeiten


---

## Deployment

- Netlify: `steuberwork.netlify.app`
- Build: `tsc && vite build`
- Supabase-Projekt-ID: `hdemkyonurqfcohhfbgj`
