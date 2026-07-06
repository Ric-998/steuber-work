// ─── Variante A — „Klar & ruhig" ────────────────────────────────────────────
// Viel Weiß, Teal nur als Akzent. Header kompakt mit Typ-Badge.
// Info als 2-spaltiges Micro-Card-Grid, Ansprechpartner als scrollbare Chips.
const { useState: useStateA } = React;

function VariantA() {
  const [active, setActive] = useStateA(Object.fromEntries(TASKS.map(t => [t.id, t.is_active])));
  const [ol, setOl] = useStateA(CURRENT_OL);
  const toggle = id => setActive(s => ({ ...s, [id]: !s[id] }));

  const P = 18; // Seiten-Padding
  const isOneTime = t => t.contracts?.type === 'einmalig';
  const isExpiredT = t => t.end_date && new Date(t.end_date) < new Date(TODAY);
  // "aktiv" = wiederkehrend & eingeschaltet ODER einmaliger Auftrag, der noch nicht abgelaufen ist
  const activeCount = TASKS.filter(t => isOneTime(t) ? !isExpiredT(t) : active[t.id]).length;
  const groups = groupByDate(UPCOMING).slice(0, 14);

  // Leistungen nach Frequenz gruppieren; einmalige Aufträge separat als eigene Gruppe unten
  const LEISTUNG_LABEL = { täglich: 'Täglich', wöchentlich: 'Wöchentlich', monatlich: 'Monatlich', quartalsweise: 'Quartalsweise', einmalig: 'Einmalige Aufträge' };
  const LEISTUNG_ORDER = ['täglich', 'wöchentlich', 'monatlich', 'quartalsweise', 'einmalig'];
  const taskGroupMap = {};
  TASKS.forEach(t => { const k = isOneTime(t) ? 'einmalig' : t.interval; (taskGroupMap[k] = taskGroupMap[k] || []).push(t); });
  const leistungsGroups = LEISTUNG_ORDER.filter(k => taskGroupMap[k]).map(k => ({ key: k, label: LEISTUNG_LABEL[k], items: taskGroupMap[k] }));

  // wiederverwendbare Sektions-Überschrift
  const SectionHead = ({ title, count, action }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '28px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <h3 style={{ fontSize: 19, fontWeight: 800, fontFamily: "'Manrope', sans-serif", margin: 0, letterSpacing: '-0.01em' }}>{title}</h3>
        {count != null && <span style={{ fontSize: 13, fontWeight: 700, color: '#096a70' }}>{count}</span>}
      </div>
      {action}
    </div>
  );

  const microLabel = { fontSize: 10.5, fontWeight: 700, color: '#6f797b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 9 };

  return (
    <div style={{ paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>
      {/* ══ HEADER — Name prominent, Adresse zweite Zeile, Icon-Aktionen ══ */}
      <div style={{ padding: `52px ${P}px 18px`, background: '#fff', borderBottom: '1px solid #eef0f1' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button style={{ background: '#f3f4f5', border: '1px solid #e7e8e9', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="arrow_back" size={21} color="#3f484a" />
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {['history', 'qr_code', 'share'].map(ic => (
              <button key={ic} style={{ background: '#f3f4f5', border: '1px solid #e7e8e9', borderRadius: 11, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name={ic} size={19} color="#6f797b" />
              </button>
            ))}
            <button style={{ background: '#096a70', border: 'none', borderRadius: 11, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="edit" size={19} color="#fff" />
            </button>
          </div>
        </div>
        {/* Typ-Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#d4f5f2', color: '#096a70', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
          <Icon name="apartment" size={14} />
          {OBJ.object_type}
        </div>
        <h1 style={{ fontSize: 25, fontWeight: 800, fontFamily: "'Manrope', sans-serif", margin: 0, lineHeight: 1.12, letterSpacing: '-0.02em' }}>
          {OBJ.address}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 14.5, color: '#6f797b' }}>
          <Icon name="location_on" size={16} color="#9aa3a5" />
          {OBJ.postal_code} {OBJ.city}
          <span style={{ width: 3, height: 3, borderRadius: 2, background: '#bfc8ca' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#9aa3a5' }}>{OBJ.object_number}</span>
        </div>
      </div>

      <div style={{ padding: `0 ${P}px` }}>
        {/* ══ INFO — Label über Wert: volle Breite, kein Abschneiden, kein Aufklappen ══ */}
        <div style={{ background: '#fff', border: '1px solid #e7e8e9', borderRadius: 16, padding: '4px 16px', marginTop: 18 }}>
          {/* Kunde — voller Name + Kontaktaktionen direkt darunter */}
          <div style={{ padding: '15px 0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Kunde</span>
              {CUSTOMER.lexware_id && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#096a70', background: '#e8f4f5', borderRadius: 999, padding: '3px 9px 3px 7px' }}>
                  <Icon name="link" size={13} /> Lexware
                </span>
              )}
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: '#191c1d', lineHeight: 1.25, marginTop: 5, letterSpacing: '-0.01em', textWrap: 'pretty' }}>{CUSTOMER.name}</div>
            <div style={{ fontSize: 12, color: '#6f797b', marginTop: 3 }}>{TYPE_LABEL[CUSTOMER.customer_type]}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <a href={`tel:${CUSTOMER.phone}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: '#096a70', color: '#fff', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}><Icon name="call" size={15} /> Anrufen</a>
              <a href={`mailto:${CUSTOMER.email}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: '#f3f4f5', color: '#3f484a', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}><Icon name="mail" size={15} /> E-Mail</a>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(`${OBJ.address}, ${OBJ.postal_code} ${OBJ.city}`)}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: '#f3f4f5', color: '#3f484a', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}><Icon name="map" size={15} /> Karte</a>
            </div>
          </div>

          <div style={{ height: 1, background: '#f1f3f4', margin: '0 -16px' }} />

          {/* Verwaltung — voller Name, tippbar zum Öffnen */}
          <button style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '14px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Verwaltung</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#096a70', marginTop: 4, textWrap: 'pretty', lineHeight: 1.25 }}>{CUSTOMER.hausverwaltung.name}</div>
            </div>
            <Icon name="chevron_right" size={20} color="#bfc8ca" />
          </button>

          <div style={{ height: 1, background: '#f1f3f4', margin: '0 -16px' }} />

          {/* Objekt-ID + Objektleiter — zwei Spalten nebeneinander */}
          <div style={{ display: 'flex', gap: 14, padding: '14px 0 15px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Objekt-ID</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#191c1d', marginTop: 5, fontFamily: 'monospace' }}>{CUSTOMER.hausverwaltung_objekt_id}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #f1f3f4', paddingLeft: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Objektleiter</div>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginTop: 3, maxWidth: '100%' }}>
                <select value={ol} onChange={e => setOl(e.target.value)} style={{
                  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                  border: 'none', background: 'transparent', color: '#096a70', fontWeight: 700,
                  fontSize: 14, fontFamily: "'Inter', sans-serif", textAlign: 'left',
                  paddingRight: 20, paddingLeft: 0, cursor: 'pointer', outline: 'none', maxWidth: '100%',
                }}>
                  {OL_LIST.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </select>
                <Icon name="unfold_more" size={15} color="#096a70" style={{ position: 'absolute', right: 0, pointerEvents: 'none' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ══ ANSPRECHPARTNER — gestapelte Liste (Stil aus Variante B) ══ */}
        <div style={{ background: '#fff', border: '1px solid #e7e8e9', borderRadius: 16, padding: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ansprechpartner · {CONTACTS.length}</div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: '#096a70', background: '#d4f5f2', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}><Icon name="add" size={14} /> Neu</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {CONTACTS.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: i ? '1px solid #eef0f1' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg,#096a70,#0c8f85)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{initials(c.first_name, c.last_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.first_name} {c.last_name}</div>
                  <div style={{ fontSize: 11, color: '#6f797b' }}>{c.role}</div>
                </div>
                <a href={`tel:${c.phone}`} style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#096a70', textDecoration: 'none', flexShrink: 0 }}><Icon name="call" size={17} /></a>
              </div>
            ))}
          </div>
        </div>

        {/* ══ LEISTUNGEN ══ */}
        <SectionHead
          title="Leistungen"
          count={`${activeCount} aktiv`}
          action={
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#096a70', background: '#d4f5f2', padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              <Icon name="add" size={16} /> Neu
            </button>
          }
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {leistungsGroups.map(g => (
            <div key={g.key}>
              {/* Frequenz-Zwischenüberschrift (wie Datums-Divider bei Terminen) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: '#3f484a', whiteSpace: 'nowrap' }}>
                  <Icon name={INTERVAL_ICONS[g.key]} size={15} color="#9aa3a5" /> {g.label}
                </span>
                <span style={{ flex: 1, height: 1, background: '#e7e8e9' }} />
                <span style={{ fontSize: 10.5, color: '#9aa3a5', fontWeight: 600 }}>{g.items.length}</span>
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e7e8e9', overflow: 'hidden' }}>
                {g.items.map((t, i) => {
                  const on = active[t.id];
                  const oneTime = isOneTime(t);
                  const isExpired = isExpiredT(t);
                  const dim = oneTime ? isExpired : (!on || isExpired);
                  const upc = UPCOMING.filter(a => a.task_id === t.id).length;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid #f1f3f4' : 'none', opacity: dim ? 0.55 : 1, transition: 'opacity .2s' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f3f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0 }}>{t.categories.emoji}</div>
                      {/* Inhalt tappbar → Bearbeiten */}
                      <button style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, fontFamily: "'Manrope', sans-serif", lineHeight: 1.2, letterSpacing: '-0.01em', color: '#191c1d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, fontSize: 11.5, color: '#6f797b' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="person" size={13} color="#9aa3a5" /> {t.users.full_name.split(' ')[0]}</span>
                          <span style={{ width: 2, height: 2, borderRadius: 1, background: '#cdd4d5', flexShrink: 0 }} />
                          <span style={{ color: upc ? '#096a70' : '#9aa3a5', fontWeight: 600 }}>{upc ? `${upc} Termin${upc > 1 ? 'e' : ''}` : 'Keine Termine'}</span>
                          {isExpired && !oneTime && <span style={{ fontSize: 10, fontWeight: 700, color: '#93000a', background: '#ffdad6', padding: '1px 6px', borderRadius: 5 }}>Abgelaufen</span>}
                        </div>
                      </button>
                      {/* Wiederkehrend → Toggle · Einmaliger Auftrag → Status */}
                      {oneTime ? (
                        <span style={{ flexShrink: 0, boxSizing: 'border-box', height: 26, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '0 10px', borderRadius: 999, color: isExpired ? '#166534' : '#3f484a', background: isExpired ? '#dcfce7' : '#f3f4f5' }}>
                          <Icon name={isExpired ? 'check_circle' : 'looks_one'} size={12} fill={isExpired} /> {isExpired ? 'Erledigt' : 'Einmalig'}
                        </span>
                      ) : (
                        <button onClick={() => toggle(t.id)} style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', background: on && !isExpired ? '#096a70' : '#cdd4d5', transition: 'background .2s' }}>
                          <span style={{ position: 'absolute', top: 3, left: on && !isExpired ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .2s' }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ══ NÄCHSTE TERMINE — Datums-Divider + gruppierte Tageskarte ══ */}
        <SectionHead title="Nächste Termine" action={<span style={{ fontSize: 12, color: '#9aa3a5', fontWeight: 600 }}>30 Tage</span>} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ date, items }) => {
            const isToday = date === TODAY;
            return (
              <div key={date}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: "'Manrope', sans-serif", color: isToday ? '#096a70' : '#3f484a', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{formatDateLabel(date, TODAY)}</span>
                  <span style={{ flex: 1, height: 1, background: '#e7e8e9' }} />
                  <span style={{ fontSize: 10.5, color: '#9aa3a5', fontWeight: 600 }}>{items.length} Aufg.</span>
                </div>
                <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${isToday ? '#a8ece8' : '#e7e8e9'}`, overflow: 'hidden' }}>
                  {items.map((a, i) => {
                    const task = TASKS.find(t => t.id === a.task_id);
                    const st = STATUS_META[a.status];
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderTop: i ? '1px solid #eef0f1' : 'none' }}>
                        <span style={{ fontSize: 19, flexShrink: 0 }}>{task?.categories.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task?.title}</div>
                          <div style={{ fontSize: 11.5, color: '#6f797b', marginTop: 1 }}>{a.users.full_name}</div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, padding: '4px 9px', borderRadius: 999, flexShrink: 0 }}>
                          <Icon name={st.icon} size={12} /> {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.VariantA = VariantA;
