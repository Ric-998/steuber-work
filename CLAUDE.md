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
`src/pages/Dashboard.tsx` – 4 Tabs:
- **Übersicht**: KPI-Kacheln (Tagesstatus, Probleme, Erledigte diese Woche), aktuelle Problem-Assignments
- **Aufträge**: Liste aller Tasks mit Filter, Edit/Toggle, Verlauf, QR-Code je Objekt; FAB zum Anlegen neuer Aufgaben (3-Step-Overlay)
- **Team**: Mitarbeiter einladen (per E-Mail über Edge Function), Team-Liste mit Aktiv/Inaktiv-Toggle
- **Profil**: Abmelden

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
| `customers` | Kunden / Hausverwaltungen (contract_type: jahresvertrag \| einmalig) |
| `objects` | Gebäude/Objekte mit Adresse, verknüpft mit customer |
| `categories` | Aufgabenkategorien mit Emoji (Gebäudereinigung, Sanitär, Glas, …) |
| `tasks` | Aufgaben mit Intervall (täglich/wöchentlich/monatlich/quartalsweise/einmalig), due_date, end_date, default_assignee |
| `task_assignments` | Konkrete Zuweisung pro Tag; Status: offen/in_arbeit/erledigt/problem/vertretung |
| `task_reports` | Abschlussberichte mit Foto-URLs (Storage: `task-photos`) und Notiz |
| `leave_requests` | Urlaubs- und Krankmeldungen; Status: ausstehend/genehmigt/abgelehnt |
| `push_subscriptions` | VAPID-Subscriptions pro User |
| `bug_reports` | In-App Fehlerberichte |

RPC-Funktion: `get_my_profile()` (gibt Profil + Rollenname zurück), `get_dashboard_stats()` (KPI-Aggregat)

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
  App.tsx              # Auth-Gate, Rollenweiche, DEV-Switcher
  pages/
    Dashboard.tsx      # Admin-View (inkl. Create/Edit/Object-Overlays)
    TaskList.tsx       # Mitarbeiter-View (inkl. ZeitTab, ProfileTab)
    Login.tsx          # Login-Page
  components/
    BugReport.tsx      # In-App Bug-Meldeformular
    OnboardingTour.tsx # Interaktiver App-Rundgang + InstallGuide
    MapView.tsx        # Leaflet-Karte (vorhanden, noch nicht voll integriert)
    QRCode.tsx         # QR-Code-Generator je Objekt
  lib/
    supabase.ts        # Supabase-Client (URL + anon key hardcoded)
    push.ts            # Service Worker Registrierung + VAPID Push
  types/index.ts       # Alle TypeScript-Interfaces
  styles/global.css    # CSS-Variablen (--pri, --bg, --surf-*, --ok, --err, …)
supabase/functions/
  invite-user/index.ts
  send-push/index.ts
public/
  sw.js                # Service Worker für Push + PWA
  manifest.json        # PWA-Manifest
```

---

## Offene Punkte / bekannte TODOs

- **`DEV_MODE = true`** in `App.tsx` (Zeile 17): Dev-Switcher (Admin/Mitarbeiter-Toggle) muss vor Live-Betrieb entfernt werden
- **MapView** (`leaflet`-Abhängigkeit vorhanden): Echte interaktive Karte ist vorbereitet, aber in der Aufgabendetail-View wird noch ein SVG-Platzhalter gerendert
- **Verfügbarkeitsplanung** (Wochenplan/Schichtplanung): Als "Phase 3" markiert, UI-Platzhalter vorhanden
- **Vertretungs-Anfrage**: Status `vertretung` ist im Typ definiert, aber der UI-Flow fehlt noch
- **Objektleiter-Rolle**: Im Typsystem vorhanden, aber noch keine eigene View implementiert

---

## Deployment

- Netlify: `steuberwork.netlify.app`
- Build: `tsc && vite build`
- Supabase-Projekt-ID: `hdemkyonurqfcohhfbgj`
