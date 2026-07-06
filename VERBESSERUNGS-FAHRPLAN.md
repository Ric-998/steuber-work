# SteuberWork – Verbesserungs-Fahrplan

*Stand: 06.07.2026 · Basis: Code-Analyse (src/, supabase/functions/) + Supabase-Advisors (Live-Projekt `hdemkyonurqfcohhfbgj`)*

---

## Teil 1: Ist-Analyse

### 1. Sicherheit ⚠️ (kritischster Bereich)

| # | Befund | Beleg | Schwere |
|---|--------|-------|---------|
| S1 | **`send-push` hat keinerlei Auth-Check.** Jeder mit der Function-URL kann beliebigen Mitarbeitern Push-Nachrichten mit frei wählbarem Titel/Text/Link senden (Phishing-Vektor). CORS ist `*`. | `supabase/functions/send-push/index.ts` – `Deno.serve` liest direkt `req.json()`, kein `getUser()` | 🔴 Kritisch |
| S2 | **VAPID Private Key hardcoded im Repo** (`VAPID_PRIVATE_KEY = 'IdNS...'` in `send-push/index.ts`, Z. 4). Wer das Repo sieht, kann sich als Steuber-Push-Absender ausgeben. | ebd. | 🔴 Kritisch |
| S3 | **`object_tokens` INSERT-Policy ist `WITH CHECK (true)` für alle Rollen.** Damit kann jeder Tokens für beliebige Objekte anlegen und über `get-object-status` Objektdaten + Aufgabenstatus abrufen. | Supabase Advisor `rls_policy_always_true`, Policy `object_tokens_admin_insert` | 🔴 Kritisch |
| S4 | **11 SECURITY-DEFINER-RPCs sind für `anon` ausführbar**, u. a. `generate_task_assignments()`, `auto_deactivate_expired_tasks()`, `handle_new_user()`, `rls_auto_enable()`. Nicht eingeloggte Angreifer können damit DB-Zustand verändern. | Advisor `anon_security_definer_function_executable` | 🟠 Hoch |
| S5 | **Leaked Password Protection deaktiviert** (HaveIBeenPwned-Abgleich). | Advisor `auth_leaked_password_protection` | 🟡 Mittel |
| S6 | 10 DB-Funktionen ohne fixierten `search_path` (Privilege-Escalation-Risiko bei SECURITY DEFINER). | Advisor `function_search_path_mutable` | 🟡 Mittel |
| S7 | CSP erlaubt `unsafe-eval` und `unsafe-inline` für Scripts. | `netlify.toml` | 🟡 Mittel |
| S8 | `send-push` wird in `TaskList.tsx` (Z. 328, 454) per hartkodierter `fetch`-URL aufgerufen (Auth-Header wird zwar mitgeschickt, aber serverseitig ignoriert – siehe S1); besser einheitlich `supabase.functions.invoke()`. | `src/pages/TaskList.tsx` | 🟡 Mittel |

Positiv: `invite-user` und `create-user-direct` prüfen sauber auf Admin-Rolle. RLS ist auf allen Tabellen aktiv (Policies vorhanden). Statusseite `get-object-status` prüft Token-Ablauf.

### 2. Code-Qualität

- **`Dashboard.tsx`: 8.506 Zeilen, 364 `useState`, 88 Supabase-Calls, 0× `useMemo`/`useCallback`/`memo`.** Alles in einer Datei = jeder State-Change kann den kompletten Baum neu rendern; Edits (per Python-Skript!) sind fehleranfällig.
- **Fehlerbehandlung lückenhaft:** 88 Supabase-Calls, aber nur 13 `if (error)`-Checks. Konkret: Kunden-Löschen (Z. 5596) und Ansprechpartner-Löschen (Z. 5686) ignorieren `error` komplett – schlägt RLS zu, sagt die UI „gelöscht", die Zeile existiert weiter.
- **Manuelle Lösch-Kaskaden ohne Transaktion:** Objekt-Löschung (Z. 2650–2669) löscht `task_reports` → `task_assignments` → `tasks` → `contact_persons` → `object_services` → `objects` sequentiell im Client. Bricht ein Schritt ab, bleiben Waisen zurück.
- **Inkonsistente Confirm-Patterns:** teils `window.confirm` (Z. 1188, 2775), teils eigene Dialoge, teils `alert()`.
- **CLAUDE.md veraltet:** dokumentiert 2 Edge Functions, es existieren **8** (`cal-feed`, `create-user-direct`, `fetch-lexware-customers`, `generate-assignments`, `get-object-status`, `optimize-route`, …). Tabellen `equipment`, `equipment_assignments`, `object_keys`, `key_transfers`, `messages`, `feedback`, `services`, `calendar_tokens`, `invite_tokens` fehlen in der Doku.
- **Repo-Hygiene:** ~45 `vite.config.ts.timestamp-*.mjs`-Dateien im Root, `dist/` (17 MB, mit Dutzenden Alt-Builds) im Ordner, `ObjectDetail.design.tsx` mit `@ts-nocheck` als tote Referenz.

### 3. Performance

- **DB (Supabase Advisors):** ~30 unindizierte Foreign Keys (u. a. `task_assignments`, `tasks`, `leave_requests`); `auth_rls_initplan`-Warnung auf fast allen Tabellen (`auth.uid()` wird pro Zeile statt einmal ausgewertet); massenhaft `multiple_permissive_policies` (jede Query prüft 2+ Policies pro Aktion). Bei wachsender Datenmenge wird das spürbar.
- **`loadAll()` lädt bei jedem Realtime-Event alles neu** (10 parallele + 4 sequentielle Queries, 1,5 s Debounce) – auch wenn sich nur ein Assignment-Status ändert. Die `roles`-Tabelle wird bei jedem Durchlauf erneut geladen.
- **Keine Memoization:** Bei 364 States in einer Komponente rendert jeder Tastendruck in einem Suchfeld potenziell alle Tabs mit.
- **Foto-Upload ohne Kompression:** `TaskList.tsx` (Z. 292–296) lädt Original-Handyfotos (oft 3–8 MB) hoch – langsam im Mobilfunknetz, teurer Storage, langsamer Tagesbericht.
- Positiv: `manualChunks` für React/Supabase/xlsx/Leaflet, `xlsx` dynamisch importiert, MapView lazy. Haupt-Bundle ~586 KB (unkomprimiert) ist okay, aber durch Dashboard-Split weiter reduzierbar.

### 4. UI/UX

- **Fehler-Feedback fehlt bei Mutationen:** Toast-System existiert (`showToast`), wird aber bei vielen Schreiboperationen nicht genutzt (siehe fehlende error-Checks). Nutzer merkt Fehlschläge nicht.
- **Offline-Verhalten ungeeignet für die Zielgruppe:** Reinigungskräfte arbeiten in Kellern/Tiefgaragen. Der SW ist network-first ohne Daten-Fallback, es gibt kein `navigator.onLine`-Handling, keine Retry-Queue – ein Status-Update ohne Empfang geht **kommentarlos verloren**.
- **Empty States unausgewogen:** Dashboard hat 28 „Keine …"-Zustände, TaskList (die Mitarbeiter-Hauptansicht!) nur 4.
- **Destruktive Aktionen:** Bestätigungen sind meist vorhanden, aber uneinheitlich (nativer `confirm` vs. Design-Dialog) und ohne Undo. Objekt-Löschung vernichtet unwiderruflich alle historischen Berichte inkl. Fotos.
- Positiv: Lade-Screen, Update-Banner, Onboarding-Tour, PWA-Install-Banner, Loader im Dashboard sind da.

### 5. Featurelücken für echten Produktivbetrieb

Offline-Queue für Status-Updates und Foto-Uploads (wichtigste Lücke), Foto-Kompression, Vertretungs-Flow auf Mitarbeiterseite (Tauschbörse existiert nur im Admin-Dashboard), Objektleiter-Dashboard (Grundgerüst, 707 Zeilen), MapView (Platzhalter), zentrales Fehler-Monitoring (nur manuelle `bug_reports`), Soft-Delete/Papierkorb für Objekte & Kunden.

---

## Teil 2: Priorisierter Fahrplan

### 🔥 Stufe 1 – Sofort (Quick Wins, < 1 Tag)

| # | Maßnahme | Aufwand |
|---|----------|---------|
| 1.1 | **`send-push` absichern:** JWT-Check einbauen (`auth.getUser()` wie in `invite-user`), nur `authenticated` zulassen; die zwei `fetch`-Aufrufe in `TaskList.tsx` auf `supabase.functions.invoke('send-push', …)` umstellen (Header wird dort bereits mitgeschickt, invoke ist nur einheitlicher). | ~2 h |
| 1.2 | **VAPID-Key rotieren:** neues Schlüsselpaar generieren, Private Key als Function-Secret (`supabase secrets set VAPID_PRIVATE_KEY=…`), aus dem Code entfernen, alle `push_subscriptions` invalidieren (Nutzer müssen Push 1× neu aktivieren). | ~1 h |
| 1.3 | **`object_tokens`-INSERT-Policy fixen:** `WITH CHECK (true)` → `WITH CHECK (get_my_role() = 'admin')` per Migration. | 15 min |
| 1.4 | **`REVOKE EXECUTE` für `anon`** auf allen SECURITY-DEFINER-RPCs (`rls_auto_enable`, `handle_new_user`, `generate_task_assignments`, `auto_deactivate_expired_tasks`, `get_dashboard_*`, …); für `authenticated` nur die tatsächlich vom Frontend genutzten behalten. | ~1 h |
| 1.5 | **Leaked Password Protection aktivieren** (Supabase Dashboard → Auth → 1 Toggle). | 5 min |
| 1.6 | **Error-Checks bei allen `.delete()`/`.update()`/`.insert()` nachrüsten** – Muster: `const {error} = await …; if (error) { showToast('Fehler: '+error.message,'err'); return }`. Betrifft v. a. Kunden-/Kontakt-/Objekt-Löschung in `Dashboard.tsx`. | ~3 h |
| 1.7 | **Repo aufräumen:** `vite.config.ts.timestamp-*` löschen, `dist/` + `*.timestamp-*.mjs` in `.gitignore`, `ObjectDetail.design.tsx` archivieren oder löschen. | 30 min |
| 1.8 | **CLAUDE.md aktualisieren** (8 Edge Functions, fehlende 9 Tabellen) – verhindert Fehlentscheidungen bei künftigen KI-gestützten Edits. | 30 min |

### 📅 Stufe 2 – Kurzfristig (1–2 Wochen)

| # | Maßnahme | Details |
|---|----------|---------|
| 2.1 | **`Dashboard.tsx` aufteilen** | Mechanische Extraktion der bereits vorhandenen internen Komponenten in eigene Dateien: `tabs/UebersichtTab.tsx`, `tabs/ObjekteTab.tsx` (+ `ObjectDetail.tsx`, `EditObjectOverlay.tsx`), `tabs/KundenTab.tsx` (`KundenList`, `KundeDetail`), `tabs/AnsprechpartnerTab.tsx`, `tabs/TagesberichtTab.tsx`, `tabs/TeamTab.tsx`, `overlays/CreateTaskOverlay.tsx`, `overlays/EditTaskOverlay.tsx`. Gemeinsame Hooks: `hooks/useServerSearch.ts` (Debounce-Suche 3× dupliziert), `hooks/useToast.ts`. Ziel: keine Datei > 800 Zeilen. **Nebeneffekt: das `Edit`-Tool-Problem (OneDrive-Block bei 8.500 Zeilen) verschwindet.** |
| 2.2 | **Foto-Kompression vor Upload** | Canvas-Resize auf max. 1600 px Kante, JPEG-Qualität 0,8 → aus 5 MB werden ~300 KB. Eine Hilfsfunktion `compressImage(file): Promise<Blob>` in `lib/`, Einsatz in `TaskList.tsx` vor `storage.upload()`. |
| 2.3 | **DB-Performance-Migration** | (a) Indizes auf alle ~30 unindizierten FKs (Advisor-Liste), v. a. `task_assignments`, `tasks`, `leave_requests`; (b) alle Policies von `auth.uid()` auf `(select auth.uid())` umstellen (initplan-Fix); (c) mehrfach-permissive Policies je Tabelle/Aktion zu einer zusammenfassen; (d) `SET search_path = ''` bei den 10 gemeldeten Funktionen. |
| 2.4 | **Lösch-Kaskaden in die DB verlagern** | FK-Constraints mit `ON DELETE CASCADE` (`task_assignments→tasks`, `task_reports→task_assignments`, `object_services→objects`, …), Client-Code auf ein einziges `delete objects` reduzieren. Storage-Fotos per Edge Function oder Cron aufräumen. |
| 2.5 | **Einheitlicher `<ConfirmDialog>`** | Eine Komponente, ersetzt `window.confirm`/`alert`; rote Variante für destruktiv, mit Objekt-Name im Text. |
| 2.6 | **`loadAll()` entkoppeln** | Pro Tab eigene Lade-Funktion (`loadUebersicht`, `loadObjekte`, …), Realtime-Handler lädt nur die betroffene Entität nach. `roles` einmalig cachen. Tab-Wechsel lädt lazy statt alles vorab. |
| 2.7 | **Offline-Feedback (Minimalversion)** | `navigator.onLine` + `online`/`offline`-Events → Banner „Keine Verbindung – Änderungen werden nicht gespeichert"; Buttons für Statuswechsel deaktivieren. (Volle Queue → Stufe 3.) |
| 2.8 | **Empty States + Loading in TaskList nachziehen** | Jede Liste (Aufgaben, Anträge, Verlauf) braucht definierten Leer-, Lade- und Fehlerzustand. |

### 🚀 Stufe 3 – Mittelfristig (Phase 3+)

| # | Maßnahme | Details |
|---|----------|---------|
| 3.1 | **Echter Offline-Support** | IndexedDB-Queue für Status-Updates und Foto-Uploads; bei `online`-Event abarbeiten (Background Sync API wo verfügbar); optimistisches UI mit „ausstehend"-Badge am Task. Für die Zielgruppe (Keller, Tiefgaragen) der größte Produktivitätshebel. |
| 3.2 | **Daten-Layer mit TanStack Query** | Ersetzt manuelles `loadAll`-State-Management: Caching, Refetch-on-Focus, Invalidierung pro Entität, weniger Re-Renders. Sinnvoll direkt nach dem Dashboard-Split (2.1). |
| 3.3 | **Vertretungs-Flow mitarbeiterseitig** | „Kann nicht"-Button am Assignment → Status `vertretung` → Push an Team → Übernahme-Button. Admin-Tauschbörse existiert bereits als Gegenstück. |
| 3.4 | **Objektleiter-Dashboard fertigstellen** | Eigene Objektliste, Problem-Eskalation, eingeschränkte Team-Sicht auf Basis `objektleiter_id`. |
| 3.5 | **MapView aktivieren** | Leaflet ist installiert und lazy-geladen; SVG-Platzhalter ersetzen, Objekt-Pins + Tagesroute (passt zu vorhandener `optimize-route`-Function). |
| 3.6 | **Fehler-Monitoring** | Sentry (o. ä.) an `ErrorBoundary` + `window.onerror` anbinden; Edge-Function-Fehler via Log-Drain. Ergänzt die manuellen `bug_reports`. |
| 3.7 | **Soft-Delete für Objekte/Kunden** | `deleted_at`-Spalte statt Hard-Delete, 30-Tage-Papierkorb im Admin – schützt historische Berichte/Fotos vor versehentlichem Totalverlust. |
| 3.8 | **CSP verschärfen** | Prüfen, welche Lib `unsafe-eval` braucht (vermutlich keine mehr nach xlsx-Lazy-Load), dann entfernen; Inline-Styles bleiben (Architektur-Entscheidung). |

---

## Empfohlene Reihenfolge Woche 1

**Tag 1:** 1.1–1.5 (Sicherheit komplett) → **Tag 2:** 1.6–1.8 → **Tag 3–5:** 2.1 (Dashboard-Split) beginnen, da er alle weiteren Arbeiten beschleunigt.

*Hinweis: 1.1–1.4 betreffen das Live-System und sollten vor jedem weiteren Feature passieren – die Lücken sind heute schon ausnutzbar.*
