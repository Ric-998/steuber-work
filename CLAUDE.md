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

Die App hat **zwei Views**, die je nach Rolle automatisch gerendert werden:

### Admin (Till)
`src/pages/Dashboard.tsx` – responsive (Desktop-Sidebar + Mobile-Tabs), 8 Tabs:
- **Übersicht**: KPI-Kacheln (Tagesstatus, Probleme, Erledigte diese Woche), aktuelle Problem-Assignments, Tagesbericht-Vorschau
- **Objekte**: Liste aller Objekte mit Server-Suche (ab 2 Zeichen, 350ms debounce), Gruppierung (keine/Stadt/Kunde); Detail-View (`ObjectDetail`) mit variantA-Design (Header mit Typ-Badge + Adresse, 2-Spalten-Grid Kunde+Ansprechpartner, Leistungen nach Frequenz gruppiert, Nächste Termine nach Datum gruppiert), F5-stabile URL-Hash-Navigation
- **Kunden**: Kundenliste mit Server-Suche; Kunden-Detail mit Objekt-Liste; Privatpersonen editierbar
- **Ansprechpartner**: Globale Kontaktliste mit Server-Suche; Edit + Delete (Änderung propagiert zu allen verknüpften Objekten); Privatpersonen aus dieser Liste bearbeitbar
- **Tagesbericht**: Tagesprotokoll, Auswertung abgeschlossener Aufgaben mit Fotos
- **Nachrichten**: Chat-Funktion
- **Team**: Mitarbeiter einladen (per E-Mail über Edge Function), Team-Liste mit Aktiv/Inaktiv-Toggle, Urlaubssperren verwalten
- **Profil**: Abmelden, Einstellungen

### Mitarbeiter
`src/pages/TaskList.tsx` – 3 Tabs:
- **Aufgaben**: Wochenkalender (scrollbar), gefilterte Tagesliste nach Objekt gruppiert, Status-Update (offen → in_arbeit → erledigt/problem), Foto-Upload beim Abschluss
- **Zeitplan**: Urlaubsantrag, Krankmeldung, Verlauf der Anträge (Verfügbarkeit als Platzhalter für Phase 3)
- **Profil**: Push-Benachrichtigungen ein/aus, App-Tour, PWA-Installationsanleitung, Bug melden, Abmelden

---

## Datenmodell (Supabase)

| Tabelle | Beschreibung |
|---|---|
| `roles` | admin, mitarbeiter, objektleiter |
| `users` | Mitarbeiterprofile (full_name, phone, role_id, is_active) |
| `customers` | Kunden / Hausverwaltungen (customer_type: privatperson \| firma \| weg-verwaltung \| mietverwaltung) |
| `objects` | Gebäude/Objekte mit Adresse, verknüpft mit customer; `object_type`, `objektleiter_id` |
| `categories` | Aufgabenkategorien mit Emoji (Gebäudereinigung, Sanitär, Glas, …) |
| `tasks` | Aufgaben mit Intervall (täglich/wöchentlich/monatlich/quartalsweise/einmalig), due_date, end_date, default_assignee |
| `task_assignments` | Konkrete Zuweisung pro Tag; Status: offen/in_arbeit/erledigt/problem/vertretung |
| `task_reports` | Abschlussberichte mit Foto-URLs (Storage: `task-photos`) und Notiz |
| `leave_requests` | Urlaubs- und Krankmeldungen; Status: ausstehend/genehmigt/abgelehnt |
| `vacation_blackouts` | Urlaubssperren (from_date, to_date, reason, created_by) |
| `contact_persons` | Ansprechpartner; verknüpft über `object_id` oder `customer_id`; normalisiert (eine Zeile → alle Objekte) |
| `contracts` | Verträge (type: jahresvertrag \| einmalig), verknüpft mit object + customer |
| `object_tokens` | Tokens für Kunden-Statusseite (kein Login nötig) |
| `push_subscriptions` | VAPID-Subscriptions pro User |
| `bug_reports` | In-App Fehlerberichte |

RPC: `get_my_profile()`, `get_dashboard_stats()`, `get_dashboard_problems()`

---

## Supabase Edge Functions

| Function | Zweck |
|---|---|
| `invite-user` | Admin-only: schickt Einladungs-E-Mail per `inviteUserByEmail`, legt Profil mit Rolle an |
| `send-push` | Sendet Web-Push-Benachrichtigungen an Mitarbeiter |

---

## Wichtige Dateien

```
src/
  App.tsx                      # Auth-Gate, Rollenweiche; DEV_MODE = false (deaktiviert)
  pages/
    Dashboard.tsx              # Admin-View (~8500 Zeilen); alle Tabs + Overlays
    TaskList.tsx               # Mitarbeiter-View (inkl. ZeitTab, ProfileTab)
    Login.tsx                  # Login-Page
    CustomerStatusPage.tsx     # Öffentliche Kunden-Statusseite (via ?view=TOKEN)
    ObjektleiterDashboard.tsx  # Objektleiter-View (Grundgerüst vorhanden)
    SupportDashboard.tsx       # Support-View
    RegisterPage.tsx           # Registrierung per Einladungs-Token
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
  send-push/index.ts
public/
  sw.js                        # Service Worker für Push + PWA
  manifest.json                # PWA-Manifest
```

---

## Dashboard.tsx – Interne Struktur (wichtig für Edits)

Die Datei ist ~8500 Zeilen lang. Wichtige Funktionen:

| Funktion | Beschreibung |
|---|---|
| `Dashboard` (default export) | Hauptkomponente; State, loadAll, Realtime, Tab-Rendering |
| `loadAll()` | Lädt alle Daten mit `.limit(200/300)`; Server-Suche je Tab |
| `ObjectDetail` | Objekt-Detailansicht; variantA-Design; URL-Hash-Navigation |
| `EditObjectOverlay` | Objekt bearbeiten |
| `KundenList` | Kundenliste mit Server-Suche |
| `KundeDetail` | Kunden-Detailansicht |
| `AnsprechpartnerList` | Globale Kontaktliste; Edit+Delete; Privatpersonen editierbar |
| `EditTaskOverlay` | Aufgabe bearbeiten |
| `CreateTaskOverlay` | Neue Aufgabe anlegen (3-Step) |

**Achtung:** Das `Edit`-Tool ist auf dem OneDrive-Pfad geblockt. Alle Änderungen an `Dashboard.tsx` müssen per `python3`-Skript via Bash (String-Replacement) erfolgen.

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

## Offene Punkte / bekannte TODOs

- **MapView**: Leaflet-Abhängigkeit vorhanden, SVG-Platzhalter wird noch gerendert
- **Verfügbarkeitsplanung**: Phase 3 – UI-Platzhalter vorhanden
- **Vertretungs-Anfrage**: Status `vertretung` definiert, UI-Flow fehlt noch
- **Objektleiter-Rolle**: `ObjektleiterDashboard.tsx` als Grundgerüst vorhanden, noch nicht vollständig

---

## Deployment

- Netlify: `steuberwork.netlify.app`
- Build: `tsc && vite build`
- Supabase-Projekt-ID: `hdemkyonurqfcohhfbgj`
