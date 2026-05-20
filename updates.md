# SteuberWork – Feature-Updates

Alle implementierten Features und Änderungen seit Projektstart.

---

## Authentifizierung & Onboarding

### Mitarbeiter-Einladung per E-Mail & Link
- Admin kann neue Mitarbeiter per E-Mail einladen oder einen Einladungslink generieren (gültig 7 Tage, einmalig verwendbar)
- Einladungslinks werden in der `invite_tokens`-Tabelle gespeichert
- Edge Function `invite-user`: Sendet Einladungs-E-Mail via Supabase Auth, legt Profil mit Rolle und `is_onboarded: false` an

### Selbstregistrierung per Link (RegisterPage.tsx)
- Neuer Mitarbeiter öffnet Link → 2-stufiges Formular:
  - **Schritt 1**: E-Mail, Passwort (min. 8 Zeichen)
  - **Schritt 2**: Vorname, Nachname, Handynummer (**Pflichtfeld**), Straße, PLZ (Auto-Lookup), Wohnort
- Edge Function `register-with-token`: Verifiziert Token, legt Auth-Account an, schreibt in `users`-Tabelle, markiert Token als verwendet
- PLZ-Auto-Lookup via `api.zippopotam.us/de/{plz}`

### Profil-Einrichtung für E-Mail-Eingeladene (SetupProfileOverlay)
- Mitarbeiter die per E-Mail eingeladen wurden (`is_onboarded: false`) sehen beim ersten Login ein Formular
- Speichert via `complete_my_profile()` SECURITY DEFINER RPC

---

## Admin-Dashboard

### Übersicht-Tab
- **KPI-Kacheln** (alle klickbar):
  - Tagesstatus (In Arbeit / Offen)
  - Probleme → scrollt zur Problemliste
  - Heute fällig → öffnet Tagesübersicht-Overlay
  - Aufgaben gesamt → springt zu Objekte-Tab
- **Aktuelle Probleme**: Cards klickbar → öffnet Problem-Detail-Overlay
- **Offene Urlaubsanträge**: Genehmigen/Ablehnen direkt auf der Übersicht

### Tagesübersicht-Overlay
- Alle heute fälligen Aufgaben, gruppiert nach Objekt
- Farbcodiert nach Intervall, direkt zum Bearbeiten

### Problem-Detail-Overlay
- Objektadresse, Aufgabenbeschreibung, Intervall
- Mitarbeiter-Karte mit Anruf-Button (`tel:`) und SMS-Link (`sms:`)
- Mitarbeiter-Meldung: Notiz und Fotos aus `task_reports`
- Neu zuweisen an anderen MA
- Als erledigt markieren

### Objekte-Tab
- Objekt-Detailview mit Aufgabenliste, Verlauf, QR-Code
- Neue Aufgabe aus Objekt-Detail: Objekt-Auswahl übersprungen

### Aufgaben erstellen (CreateTaskOverlay)
- Intervall-spezifische Datumsauswahl:
  - Wöchentlich: Mo–Sa Buttons
  - Monatlich: „Wochentag im Monat" (1./2./3./4./Letzter + Mo–Sa) oder „Fixer Tag"
- Automatische `task_assignments` für 52 Wochen/12 Monate beim Speichern

### Aufgaben bearbeiten & löschen
- Stornieren (is_active = false) oder Löschen (unwiderruflich)
- Bestätigungs-Bottom-Sheet vor destruktiven Aktionen

### Team-Tab
- Team-Liste oben, Einladen-Button öffnet Fullscreen-Overlay
- MemberDetailOverlay: Kontakt, Arbeitstage, Stunden/Woche, Zugang entziehen

### Profil-Tab (Admin)
- Passwort ändern mit Sichtbarkeits-Toggle und Validierung
- Schnellübersicht: aktive Mitarbeiter & Objekte

---

## Mitarbeiter-App

### Aufgaben-Tab
- Wochenkalender, Tagesansicht nach Objekt gruppiert
- Kalender-Export (ICS) mit Beschreibung, Ort, Ansprechpartner, RRULE

### Problemmeldung
- 3 Optionen + Beschreibungsfeld (bei „Sonstiges" Pflicht)
- Push-Benachrichtigung an Admin sofort nach Meldung

### Profil-Tab (Mitarbeiter)
- Meine Daten: Name + Telefon bearbeitbar
- Passwort ändern
- Push-Benachrichtigungen Toggle

---

## Datenbank-Erweiterungen

| Tabelle/Feld | Beschreibung |
|---|---|
| `invite_tokens` | Token für Link-Einladungen |
| `users.is_onboarded` | Flag für Ersteinrichtung |
| `users.street/postal_code/city` | Adressdaten |
| `users.employed_since` | Eintrittsdatum |
| `users.work_days` | Arbeitstage als Array |
| `users.work_hours_per_week` | Wochenstunden |
| `get_dashboard_problems()` | SECURITY DEFINER: Probleme mit Phone + Report |
| `get_dashboard_stats()` | SECURITY DEFINER: KPI-Aggregat |
| Roles-RLS | authenticated-User können Rollen lesen |

---

## Echtzeit & Push

- Realtime-Updates: Dashboard reagiert auf task_assignments + leave_requests Änderungen
- Web-Push bei Problemmeldung an alle Admins
- Edge Functions: `invite-user`, `register-with-token`, `send-push`

---

## Offene TODOs (vor Live-Betrieb)

- [ ] `DEV_MODE = true` in `App.tsx` Zeile 17 auf `false` setzen
- [ ] Monatsübersicht / Reporting für Admin
- [ ] Tauschbörse für Aufgaben (vertretung-Flow)
- [ ] Kunden-Statusseite (read-only Link per Objekt)
- [ ] Objektleiter-Rolle (View fehlt)
- [ ] MapView vollständig integrieren
