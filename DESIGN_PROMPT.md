# Design-Prompt für Claude Design — SteuberWork ObjectDetail

## Deine Aufgabe

Analysiere die beigefügte Datei `ObjectDetail.design.tsx` und **redesigne die gesamte Objektdetail-View** von SteuberWork.

Liefere als Ergebnis den **vollständigen, lauffähigen React/TSX-Code** für die Funktion `ObjectDetail` — 1:1 ersetzbar, alle Props und State-Logik bleiben erhalten, nur die visuelle Darstellung (JSX + Inline-Styles) wird neu gestaltet.

---

## App-Kontext

**SteuberWork** ist eine interne PWA für ein Reinigungsunternehmen (Steuber Dienstleistungen GmbH).

- **Zielgeräte:** Primär Mobile (375–430px), sekundär Desktop (≥768px) — `isDesktop`-Variable ist vorhanden
- **Nutzer dieser View:** Admin / Geschäftsführer Till — kein Consumer-App, aber trotzdem modern und aufgeräumt
- **Zweck der View:** Detailansicht eines Reinigungsobjekts (Gebäude). Till sieht hier auf einen Blick: wer ist zuständig, welche Aufgaben gibt es, wann sind die nächsten Termine.

---

## Tech-Constraints (NICHT verändern)

```
- React 18 + TypeScript
- Styling: ausschließlich Inline-Styles mit CSS-Variablen (kein Tailwind, kein CSS-Modul)
- Icons: Material Symbols Outlined (className="material-symbols-outlined")
- Schriften: Manrope (Headlines), Inter (Fließtext)
- Alle State-Hooks, Event-Handler und Props bleiben unverändert
- Keine neuen npm-Pakete
```

### CSS Design Tokens

```css
--pri: #096a70        /* Teal Primär */
--pri-c: #0c8f85      /* Teal Gradient-Ende */
--pri-l: #a8ece8      /* Teal Border-Akzent */
--pri-xl: #d4f5f2     /* Teal Hintergrund-Hauch */
--bg: #f8f9fa         /* Seiten-Hintergrund */
--surf-low: #f3f4f5
--surf-card: #ffffff  /* Karten-Hintergrund */
--surf-high: #e7e8e9
--txt: #191c1d        /* Primärtext */
--txt-sec: #3f484a
--txt-muted: #6f797b
--outline: #bfc8ca    /* Borders */
--ok: #166534  --ok-bg: #dcfce7    /* Grün */
--err: #93000a --err-bg: #ffdad6   /* Rot */
--warn: #92400e --warn-bg: #fef3c7 /* Orange */
--font-head: 'Manrope', sans-serif
--font-body: 'Inter', sans-serif
```

### Icon-Klassen

```
material-symbols-outlined           → 24px Outlined
material-symbols-outlined icon-fill → 24px Filled
material-symbols-outlined icon-sm   → 18px
material-symbols-outlined icon-lg   → 28px
```

---

## Aktuelle Probleme / Was verbessert werden soll

1. **Header** wirkt flach — Objekt-Name und Adresse kaum hierarchisch unterschieden
2. **Info-Block** (Kunde, Ansprechpartner, Standort, Objektleiter) ist eine lange unlayouted Liste — keine visuelle Gruppierung, kein Scan-Muster
3. **Leistungen-Karten** — Inhalt fühlt sich gequetscht an; Edit-Aktion und Toggle konkurrieren visuell
4. **Nächste Termine** — Datum-Header und Aufgaben-Karten haben wenig visuellen Abstand; Termine wirken wie eine endlose Liste
5. **Gesamtbild** — alles hat denselben visuellen Gewicht; kein klares Primär/Sekundär-Gefühl; zu viele gleichgroße Schriften

---

## Anforderungen an das neue Design

### Allgemein
- **Klare Hierarchie:** Objekt-Name > Adresse > Metadaten. Schriftgrößen wirklich differenzieren (z.B. 22–24px für Namen, 13px für Labels).
- **Mehr Luft:** Mehr vertikales Padding zwischen Sektionen, Sektions-Überschriften klar vom Inhalt abgesetzt.
- **Konsistenz:** Alle Cards gleicher `borderRadius` (z.B. 16px), gleiches Shadow-Pattern.

### Header
- Objekt-Name prominent (22–24px, Manrope 800)
- Adresse und Stadt als zweite Zeile (14px, muted)
- Aktions-Buttons (QR, Verlauf) als Icon-Buttons oben rechts, nicht als breite Buttons
- Optional: Farbiger Objekt-Typ-Badge (Einfamilienhaus / Mehrfamilienhaus etc.)

### Info-Block
- 2-spaltige Micro-Cards für Kunde und Objektleiter (nebeneinander auf Mobile)
- Ansprechpartner als horizontale scrollbare Chips oder kompakte Kacheln
- Standort-Zeile mit `location_on`-Icon

### Leistungen
- Karten-Titel (Aufgabenname) klar größer als alle Labels/Chips
- Toggle rechts oben, `Bearbeiten`-Pill unten links — getrennt, keine Konkurrenz
- Termin-Info (nächste X Termine) als kleiner Footer in der Karte

### Nächste Termine
- Datum-Header als „Sticky"-ähnlicher Divider (Datum links, Linie rechts)
- Aufgaben darunter in einer gruppierten Card — nicht als Einzelzeilen sondern kompakt in einer Karte pro Tag
- Status-Pill rechts, Emoji + Titel links, Mitarbeiter-Name als Subzeile

### Mobile First
- Alle Touch-Targets ≥ 44px
- Keine horizontalen Overflows
- Bottom-Padding beachten (`env(safe-area-inset-bottom)`)

---

## Was du lieferst

1. **Vollständiger JSX-Block** der `ObjectDetail`-Funktion — alle `return (...)` Inhalte neu gestaltet
2. Alle Inline-Styles als direkte Style-Objekte (kein `className` außer für Material Icons)
3. Kein neuer State, keine neuen Props — nur die visuelle Darstellung ändert sich
4. Kurze **Kommentare** pro Sektion damit Ricardo die Struktur versteht

---

## Referenz-Datei

Die beigefügte Datei `ObjectDetail.design.tsx` enthält:
- Alle CSS-Tokens (oben im Kommentar-Block)
- Den vollständigen aktuellen Code der Funktion
- Alle State-Variablen und Handler die du erhalten musst

**Lies die Datei vollständig** bevor du anfängst — besonders die State-Variablen (ca. Zeile 100–160) und die bestehende JSX-Struktur.
