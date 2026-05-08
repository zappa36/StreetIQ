// StreetIQ — 1×4 panel demo
// Aesthetic: Direction A "Quiet" — warm paper, sage accent, Newsreader for headlines.
// Waveform: Direction B style EQ bars, recolored to A's sage palette.

const SI_COLORS = {
  bg: '#EAEEDD',
  bgDeep: '#DFE5CC',
  surface: '#F4F6E8',
  surfaceUp: '#FBFCF3',
  ink: '#1C1B1A',
  inkSoft: '#5A5752',
  inkFaint: '#8E8B85',
  hair: '#D2DABD',
  hairSoft: '#DDE3C9',
  // sage — primary accent (Driver A, active voice, success)
  sage: 'oklch(68% 0.10 155)',
  sageDeep: 'oklch(48% 0.11 155)',
  sageWash: 'oklch(93% 0.04 155)',
  // amber — proactive / approaching
  amber: 'oklch(74% 0.15 75)',
  amberDeep: 'oklch(56% 0.14 75)',
  amberWash: 'oklch(95% 0.05 75)',
  // rust — alerts / road closure
  rust: 'oklch(60% 0.17 30)',
  rustDeep: 'oklch(48% 0.16 30)',
  rustWash: 'oklch(94% 0.04 30)',
  // ink-blue — Driver B / dispatch info
  ink2: 'oklch(50% 0.10 245)',
  ink2Deep: 'oklch(38% 0.11 245)',
  ink2Wash: 'oklch(94% 0.03 245)',
};

const SI_PALETTES = {
  'BMW silver':  { bg: '#F2F5F9', bgDeep: '#F8FAFC', surface: '#FAFBFD', surfaceUp: '#FFFFFF', hair: '#CFD6DF', hairSoft: '#DDE2EA' },
};
const SI_ACCENT_HUES = {
  'BMW blue': { h: 250 },
};
const SI_FONTS = {
  'Space Grotesk':  "'Space Grotesk', 'Inter', system-ui, sans-serif",
};
let SI_HEAD_FONT = SI_FONTS['Space Grotesk'];
function applyAccent(hueKey) {
  const v = SI_ACCENT_HUES['BMW blue'];
  SI_COLORS.sage     = `oklch(58% 0.16 ${v.h})`;
  SI_COLORS.sageDeep = `oklch(42% 0.17 ${v.h})`;
  SI_COLORS.sageWash = `oklch(94% 0.03 ${v.h})`;
}
function applyPalette(name) {
  Object.assign(SI_COLORS, SI_PALETTES['BMW silver']);
}
function applyFont(name) {
  SI_HEAD_FONT = SI_FONTS['Space Grotesk'];
}

applyPalette('BMW silver');
applyAccent('BMW blue');
applyFont('Space Grotesk');

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "BMW silver",
  "accent": "BMW blue",
  "headFont": "Space Grotesk"
}/*EDITMODE-END*/;

// ---- Waveform (B-style bars in A's sage palette) ----
function SIWave({ mode, compact = false }) {
  const heights = compact
    ? [10, 18, 28, 36, 22, 14, 26, 38, 30, 18, 12, 22, 32, 24, 16]
    : [14, 26, 40, 56, 72, 84, 64, 46, 32, 50, 70, 86, 64, 44, 28, 18, 12, 20, 34, 48, 30, 18];
  const active = mode === 'listening' || mode === 'speaking';
  const color = mode === 'listening' ? SI_COLORS.sageDeep : mode === 'speaking' ? SI_COLORS.sage : SI_COLORS.inkFaint;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: compact ? 4 : 5, height: compact ? 44 : 96,
    }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: compact ? 3 : 5, borderRadius: 2,
          background: color,
          height: h,
          opacity: active ? 0.95 : 0.28,
          animation: active ? `siBar 0.9s ease-in-out ${i * 0.05}s infinite alternate` : 'none',
        }} />
      ))}
      <style>{`@keyframes siBar { 0% { transform: scaleY(0.32); } 100% { transform: scaleY(1); } }`}</style>
    </div>
  );
}

// ---- Helpers ----
function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const INITIAL_PARCELS = [
  { id: 'P-001', address: '12 Oak St',     customer: 'Alice Chen',   driver: 'A', eta: '14:20', status: 'pending' },
  { id: 'P-002', address: '34 Maple Ave',  customer: 'Bob Torres',   driver: 'A', eta: '14:35', status: 'pending' },
  { id: 'P-003', address: '56 Pine Rd',    customer: 'Carol Wu',     driver: 'A', eta: '14:50', status: 'pending' },
  { id: 'P-004', address: '78 Maple St',   customer: 'David Kim',    driver: 'B', eta: '14:25', status: 'pending' },
  { id: 'P-005', address: '91 Elm Blvd',   customer: 'Emma Park',    driver: 'B', eta: '14:40', status: 'pending' },
  { id: 'P-006', address: '103 Cedar Ln',  customer: 'Frank Li',     driver: 'B', eta: '14:55', status: 'pending' },
];

const INITIAL_SPOTS = [
  { id: 'S-1', x: 80,  y: 60,  confirms: 8,  label: 'Oak St N' },
  { id: 'S-2', x: 150, y: 90,  confirms: 5,  label: 'Oak St S' },
  { id: 'S-3', x: 220, y: 70,  confirms: 2,  label: 'Maple Ave' },
  { id: 'S-4', x: 300, y: 120, confirms: 0,  label: 'Pine Rd E' },
  { id: 'S-5', x: 100, y: 180, confirms: 11, label: 'Oak/Elm' },
  { id: 'S-6', x: 250, y: 160, confirms: 3,  label: 'Maple St W' },
  { id: 'S-7', x: 370, y: 90,  confirms: 6,  label: 'Cedar Ln' },
  { id: 'S-8', x: 320, y: 200, confirms: 1,  label: 'Pine/Cedar' },
  { id: 'S-9', x: 180, y: 220, confirms: 9,  label: 'Elm Blvd' },
  { id: 'S-10',x: 400, y: 160, confirms: 4,  label: 'Cedar S' },
];

const initialState = {
  driverAState: 'Driving',
  driverBState: 'Driving',
  parcels: INITIAL_PARCELS,
  events: [
    { id: 'e-init', t: '14:18:02', m: 'Route 04 dispatched · 6 stops · Driver A + B' },
  ],
  mapVisible: false,
  roadClosed: false,
  driverBAlert: false,
  driverBAccepted: false,
  spots: INITIAL_SPOTS,
  transcript: '',
  intent: '',
  entity: '',
  voiceMode: 'standby', // standby | listening | speaking
};

function reducer(s, a) {
  switch (a.type) {
    case 'A_STATE': {
      const next = { ...s, driverAState: a.payload };
      if (a.payload === 'Approaching') next.mapVisible = true;
      if (a.payload === 'Parked' && s.driverAState !== 'Parked') {
        next.spots = s.spots.map(sp => sp.id === 'S-2' ? { ...sp, confirms: sp.confirms + 1 } : sp);
      }
      return next;
    }
    case 'B_STATE': return { ...s, driverBState: a.payload };
    case 'EVENT': {
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      return { ...s, events: [{ id: 'e-'+Math.random(), t, m: a.payload, kind: a.kind || 'info' }, ...s.events].slice(0, 14) };
    }
    case 'MAP_VIS': return { ...s, mapVisible: a.payload };
    case 'ROAD_CLOSED_IMPACT':
      return {
        ...s,
        roadClosed: true,
        mapVisible: true,
        parcels: s.parcels.map(p => (p.id === 'P-001' || p.id === 'P-002')
          ? { ...p, status: 'delayed', eta: addMinutes(p.eta, 15) } : p),
      };
    case 'PARKING_IMPACT':
      return { ...s, parcels: s.parcels.map(p => p.id === 'P-001'
        ? { ...p, status: 'delayed', eta: addMinutes(p.eta, 10) } : p) };
    case 'NOT_HOME_IMPACT':
      return { ...s, parcels: s.parcels.map(p => p.id === 'P-001'
        ? { ...p, status: 'rescheduled', eta: '17:00' } : p) };
    case 'DELIVERED_IMPACT':
      return {
        ...s, mapVisible: false, driverAState: 'Driving',
        parcels: s.parcels.map(p => p.id === 'P-001' ? { ...p, status: 'delivered' } : p),
      };
    case 'B_ALERT': return { ...s, driverBAlert: a.payload };
    case 'B_ACCEPT':
      return {
        ...s, driverBAccepted: true, driverBAlert: false,
        parcels: s.parcels.map(p => p.id === 'P-004' ? { ...p, eta: addMinutes(p.eta, 8) } : p),
      };
    case 'TRANSCRIPT': return { ...s, transcript: a.payload };
    case 'INTENT': return { ...s, intent: a.intent, entity: a.entity };
    case 'VOICE_MODE': return { ...s, voiceMode: a.payload };
    case 'RESET': return initialState;
    default: return s;
  }
}

const Ctx = React.createContext(null);
const useDemo = () => React.useContext(Ctx);

// ============================================================
// Panel chrome
// ============================================================
const getTone = (tone) => ({
  sage:  { bg: SI_COLORS.bg,     accent: SI_COLORS.sageDeep, wash: SI_COLORS.sageWash },
  amber: { bg: SI_COLORS.bgDeep, accent: SI_COLORS.amberDeep, wash: SI_COLORS.amberWash },
  rust:  { bg: SI_COLORS.bg,     accent: SI_COLORS.rustDeep, wash: SI_COLORS.rustWash },
  ink2:  { bg: SI_COLORS.bgDeep, accent: SI_COLORS.ink2Deep, wash: SI_COLORS.ink2Wash },
}[tone] || {
  bg: SI_COLORS.bg, accent: SI_COLORS.sageDeep, wash: SI_COLORS.sageWash,
});

function PanelShell({ index, title, sub, tone = 'sage', children }) {
  const t = getTone(tone);
  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100%',
      background: t.bg,
      borderRight: `1px solid ${SI_COLORS.hair}`,
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: `1px solid ${SI_COLORS.hair}`,
        display: 'flex', alignItems: 'baseline', gap: 10,
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 3, background: t.accent,
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 11, color: t.accent,
          letterSpacing: '0.18em', fontWeight: 600,
        }}>PANEL {index}</span>
        <span style={{
          fontFamily: SI_HEAD_FONT,
          fontSize: 17, fontWeight: 500, color: SI_COLORS.ink,
          letterSpacing: '-0.01em',
        }}>{title}</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'Inter, system-ui',
          fontSize: 11, color: SI_COLORS.inkFaint,
          letterSpacing: '0.04em',
        }}>{sub}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Panel 1 — Voice Cockpit (Driver A)
// ============================================================
function Panel1() {
  const { state, dispatch, processIntent, micClick } = useDemo();
  const aParcel = state.parcels.find(p => p.driver === 'A' && (p.status === 'pending' || p.status === 'delayed' || p.status === 'rescheduled'));
  const mode = state.voiceMode;
  const stateColor =
    state.driverAState === 'Driving' ? SI_COLORS.sage :
    state.driverAState === 'Approaching' ? SI_COLORS.amber :
    SI_COLORS.sageDeep;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 22px 22px' }}>
      {/* state badge row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 999,
          background: SI_COLORS.surface, border: `1px solid ${SI_COLORS.hair}`,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: stateColor }} />
          <span style={{
            fontFamily: 'Inter, system-ui', fontSize: 11,
            color: SI_COLORS.inkSoft, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Driver A · {state.driverAState}</span>
        </div>
        <span style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 11, color: SI_COLORS.inkFaint, letterSpacing: '0.08em',
        }}>14:22</span>
      </div>

      {/* parcel card */}
      {aParcel && (
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: SI_COLORS.surfaceUp,
          border: `1px solid ${SI_COLORS.hair}`,
          borderRadius: 14,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10, color: SI_COLORS.inkFaint, letterSpacing: '0.14em',
            textTransform: 'uppercase', fontWeight: 600,
          }}>
            <span>Current · {aParcel.id}</span>
            <span>ETA</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontFamily: SI_HEAD_FONT,
                fontSize: 19, fontWeight: 500, color: SI_COLORS.ink,
                letterSpacing: '-0.01em', lineHeight: 1.15,
              }}>{aParcel.address}</div>
              <div style={{
                fontFamily: 'Inter, system-ui', fontSize: 12,
                color: SI_COLORS.inkSoft, marginTop: 2,
              }}>{aParcel.customer}</div>
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 22, fontWeight: 500, color: SI_COLORS.ink,
              letterSpacing: '-0.01em',
            }}>{aParcel.eta}</div>
          </div>
        </div>
      )}

      {/* mic + waveform */}
      <div style={{
        marginTop: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <SIWave mode={mode} />
        <button
          onClick={micClick}
          style={{
            width: 88, height: 88, borderRadius: '50%',
            background: mode === 'listening' ? SI_COLORS.sageDeep : mode === 'speaking' ? SI_COLORS.sage : SI_COLORS.surface,
            border: `1px solid ${mode === 'standby' ? SI_COLORS.hair : SI_COLORS.sage}`,
            color: mode === 'standby' ? SI_COLORS.sageDeep : '#fff',
            fontFamily: SI_HEAD_FONT,
            fontSize: 14, fontStyle: 'italic',
            letterSpacing: '0.04em',
            cursor: 'pointer', transition: 'all .25s',
            boxShadow: mode !== 'standby' ? `0 0 0 8px ${SI_COLORS.sageWash}` : 'none',
          }}
        >
          {mode === 'listening' ? '● rec' : mode === 'speaking' ? 'otto' : 'speak'}
        </button>
        <div style={{
          minHeight: 56, textAlign: 'center', maxWidth: 320,
        }}>
          {state.transcript ? (
            <>
              <div style={{
                fontFamily: SI_HEAD_FONT,
                fontStyle: 'italic',
                fontSize: 16, color: SI_COLORS.ink, lineHeight: 1.35,
              }}>“{state.transcript}”</div>
              {state.intent && (
                <div style={{ marginTop: 8, display: 'inline-flex', gap: 6 }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: 10, color: SI_COLORS.sageDeep,
                    background: SI_COLORS.sageWash,
                    padding: '3px 8px', borderRadius: 4,
                    letterSpacing: '0.1em', fontWeight: 600,
                  }}>{state.intent}</span>
                  {state.entity && (
                    <span style={{
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                      fontSize: 10, color: SI_COLORS.inkSoft,
                      border: `1px solid ${SI_COLORS.hair}`,
                      padding: '3px 8px', borderRadius: 4,
                      letterSpacing: '0.06em',
                    }}>{state.entity}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{
              fontFamily: 'Inter, system-ui',
              fontSize: 12, color: SI_COLORS.inkFaint,
              letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500,
            }}>Tap to speak · or say "Hey Otto"</div>
          )}
        </div>
        {/* quick test phrases */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 320 }}>
          {[
            { l: 'Road closed on Maple', i: 'road_closed', e: 'Maple Street' },
            { l: 'Parking issue', i: 'parking_issue', e: '' },
            { l: 'Customer not home', i: 'customer_not_home', e: '' },
            { l: 'Delivered', i: 'delivery_complete', e: '' },
          ].map((q) => (
            <button key={q.l}
              onClick={() => processIntent(q.i, q.e, q.l)}
              style={{
                fontFamily: 'Inter, system-ui', fontSize: 11,
                color: SI_COLORS.inkSoft, fontWeight: 500,
                background: SI_COLORS.surface,
                border: `1px solid ${SI_COLORS.hair}`,
                padding: '5px 9px', borderRadius: 999, cursor: 'pointer',
              }}>{q.l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Panel 2 — Adaptive Map (Driver A)
// ============================================================
function Panel2() {
  const { state } = useDemo();
  const spotColor = (c) => {
    if (c === 0) return SI_COLORS.inkFaint;
    if (c <= 3) return 'oklch(82% 0.06 150)';
    if (c <= 7) return 'oklch(70% 0.09 150)';
    return SI_COLORS.sageDeep;
  };
  return (
    <div style={{ height: '100%', position: 'relative', padding: '18px' }}>
      {!state.mapVisible ? (
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          border: `1px dashed ${SI_COLORS.hair}`, borderRadius: 14,
          background: SI_COLORS.surface,
        }}>
          <div style={{
            fontFamily: SI_HEAD_FONT, fontStyle: 'italic',
            fontSize: 22, color: SI_COLORS.inkSoft,
          }}>Map idle</div>
          <div style={{
            fontFamily: 'Inter, system-ui', fontSize: 12, color: SI_COLORS.inkFaint,
            maxWidth: 240, textAlign: 'center', lineHeight: 1.5,
          }}>Map appears only when the driver asks for it, approaches a stop, or accepts a reroute.</div>
        </div>
      ) : (
        <div style={{
          height: '100%', borderRadius: 14, overflow: 'hidden',
          background: SI_COLORS.surfaceUp, border: `1px solid ${SI_COLORS.hair}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${SI_COLORS.hair}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: SI_COLORS.surface,
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 11, color: SI_COLORS.sageDeep,
              letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
            }}>Linden &amp; Maple</span>
            {state.roadClosed && (
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 10, color: SI_COLORS.rust,
                background: SI_COLORS.rustWash,
                padding: '3px 8px', borderRadius: 4,
                letterSpacing: '0.14em', fontWeight: 700,
              }}>REROUTE +15m</span>
            )}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
              {/* streets */}
              {[50,130,220].map(y => (
                <line key={y} x1="20" y1={y} x2="460" y2={y} stroke={SI_COLORS.hair} strokeWidth="10" strokeLinecap="round" />
              ))}
              {[120,300].map(x => (
                <line key={x} x1={x} y1="14" x2={x} y2="266" stroke={SI_COLORS.hair} strokeWidth="10" strokeLinecap="round" />
              ))}
              {/* default route */}
              {!state.roadClosed && (
                <polyline points="30,50 120,50 120,130 300,130 300,220 460,220"
                  fill="none" stroke={SI_COLORS.sageDeep} strokeWidth="3" strokeLinejoin="round" />
              )}
              {state.roadClosed && (
                <>
                  {/* red X on Maple */}
                  <line x1="220" y1="120" x2="240" y2="140" stroke={SI_COLORS.rust} strokeWidth="3" />
                  <line x1="240" y1="120" x2="220" y2="140" stroke={SI_COLORS.rust} strokeWidth="3" />
                  <polyline points="30,50 120,50 120,14 300,14 300,130 460,130"
                    fill="none" stroke={SI_COLORS.amber} strokeWidth="3" strokeDasharray="6 4" strokeLinejoin="round" />
                </>
              )}
              {/* parking heatmap */}
              {state.spots.map(s => (
                <g key={s.id}>
                  <circle cx={s.x} cy={s.y} r="11" fill={spotColor(s.confirms)} opacity="0.9" />
                  <circle cx={s.x} cy={s.y} r="11" fill="none" stroke={SI_COLORS.surface} strokeWidth="1.5" />
                </g>
              ))}
              {/* truck */}
              <circle cx="120" cy={state.roadClosed ? 14 : 130} r="6" fill={SI_COLORS.ink} />
              <circle cx="120" cy={state.roadClosed ? 14 : 130} r="9" fill="none" stroke={SI_COLORS.ink} strokeWidth="1" opacity="0.4" />
            </svg>
          </div>
          <div style={{
            padding: '10px 14px', borderTop: `1px solid ${SI_COLORS.hair}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'Inter, system-ui', fontSize: 11, color: SI_COLORS.inkFaint, fontWeight: 500 }}>Parking spots:</span>
              {[0, 2, 5, 9].map(c => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: spotColor(c) }} />
                  <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10, color: SI_COLORS.inkFaint }}>
                    {c === 0 ? '0' : c === 2 ? '1-3' : c === 5 ? '4-7' : '8+'}
                  </span>
                </span>
              ))}
            </div>
            <span style={{
              fontFamily: SI_HEAD_FONT, fontStyle: 'italic',
              fontSize: 12, color: SI_COLORS.sageDeep,
            }}>shared by 47 colleagues</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Panel 3 — Dispatch Dashboard
// ============================================================
function Panel3() {
  const { state } = useDemo();
  const statusStyle = (s) => {
    const map = {
      pending:     { fg: SI_COLORS.inkSoft, bg: SI_COLORS.surface, br: SI_COLORS.hair },
      delivered:   { fg: SI_COLORS.sageDeep, bg: SI_COLORS.sageWash, br: SI_COLORS.sage },
      delayed:     { fg: SI_COLORS.rust, bg: SI_COLORS.rustWash, br: SI_COLORS.rust },
      rescheduled: { fg: 'oklch(50% 0.10 75)', bg: SI_COLORS.amberWash, br: SI_COLORS.amber },
    };
    return map[s] || map.pending;
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* parcels list */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '52px 1fr 28px 56px',
          gap: 8, alignItems: 'center', padding: '0 4px 8px',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10, color: SI_COLORS.inkFaint, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          borderBottom: `1px solid ${SI_COLORS.hair}`,
        }}>
          <span>ID</span><span>Stop · Customer</span><span>Drv</span><span style={{ textAlign: 'right' }}>ETA</span>
        </div>
        {state.parcels.map((p) => {
          const ss = statusStyle(p.status);
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '52px 1fr 28px 56px',
              gap: 8, alignItems: 'center',
              padding: '10px 4px',
              borderBottom: `1px solid ${SI_COLORS.hairSoft}`,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 11, color: SI_COLORS.inkFaint, fontWeight: 500,
              }}>{p.id}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: SI_HEAD_FONT,
                  fontSize: 14, fontWeight: 500, color: SI_COLORS.ink,
                  letterSpacing: '-0.005em', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{p.address}</div>
                <div style={{
                  fontFamily: 'Inter, system-ui', fontSize: 11,
                  color: SI_COLORS.inkSoft, marginTop: 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{p.customer}</span>
                  <span style={{
                    padding: '1px 5px', borderRadius: 3,
                    background: ss.bg, color: ss.fg,
                    border: `1px solid ${ss.br}`,
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>{p.status}</span>
                </div>
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 11, fontWeight: 700,
                color: p.driver === 'A' ? SI_COLORS.sageDeep : SI_COLORS.ink2Deep,
                background: p.driver === 'A' ? SI_COLORS.sageWash : SI_COLORS.ink2Wash,
                padding: '2px 6px', borderRadius: 4,
                textAlign: 'center', justifySelf: 'start',
              }}>{p.driver}</span>
              <span style={{
                textAlign: 'right',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 13, color: SI_COLORS.ink, fontWeight: 500,
              }}>{p.eta}</span>
            </div>
          );
        })}
      </div>

      {/* event log */}
      <div style={{
        height: 220, borderTop: `1px solid ${SI_COLORS.hair}`,
        background: SI_COLORS.surface,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${SI_COLORS.hairSoft}`,
        }}>
          <span style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10, color: SI_COLORS.inkFaint, fontWeight: 600,
            letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>System log</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: SI_COLORS.sageDeep,
              animation: 'siPulse 1.6s ease-in-out infinite',
            }} />
            <span style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 10, color: SI_COLORS.sageDeep, fontWeight: 600,
              letterSpacing: '0.14em',
            }}>LIVE</span>
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          {state.events.map(e => (
            <div key={e.id} style={{
              display: 'flex', gap: 10, padding: '4px 0',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 11, lineHeight: 1.5,
            }}>
              <span style={{ color: SI_COLORS.inkFaint, flexShrink: 0 }}>{e.t}</span>
              <span style={{
                color: e.kind === 'alert' ? SI_COLORS.rust : e.kind === 'reroute' ? SI_COLORS.sageDeep : SI_COLORS.inkSoft,
                fontWeight: e.kind === 'alert' ? 700 : 500,
              }}>{e.m}</span>
            </div>
          ))}
        </div>
        <style>{`@keyframes siPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      </div>
    </div>
  );
}

// ============================================================
// Panel 4 — Driver B Proactive Alert
// ============================================================
function Panel4() {
  const { state, dispatch, acceptB, dismissB } = useDemo();
  const bParcel = state.parcels.find(p => p.driver === 'B' && p.status === 'pending');
  const stateColor =
    state.driverBState === 'Driving' ? SI_COLORS.ink2 :
    state.driverBState === 'Approaching' ? SI_COLORS.amber :
    SI_COLORS.ink2Deep;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 22px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 999,
          background: SI_COLORS.surface, border: `1px solid ${SI_COLORS.hair}`,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: stateColor }} />
          <span style={{
            fontFamily: 'Inter, system-ui', fontSize: 11,
            color: SI_COLORS.inkSoft, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Driver B · {state.driverBState}</span>
        </div>
        <span style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 11, color: SI_COLORS.inkFaint, letterSpacing: '0.08em',
        }}>14:23</span>
      </div>

      {bParcel && (
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: SI_COLORS.surfaceUp,
          border: `1px solid ${SI_COLORS.hair}`,
          borderRadius: 14,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10, color: SI_COLORS.inkFaint, letterSpacing: '0.14em',
            textTransform: 'uppercase', fontWeight: 600,
          }}>
            <span>Current · {bParcel.id}</span>
            <span>ETA</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontFamily: SI_HEAD_FONT,
                fontSize: 19, fontWeight: 500, color: SI_COLORS.ink,
                letterSpacing: '-0.01em', lineHeight: 1.15,
              }}>{bParcel.address}</div>
              <div style={{
                fontFamily: 'Inter, system-ui', fontSize: 12,
                color: SI_COLORS.inkSoft, marginTop: 2,
              }}>{bParcel.customer}</div>
            </div>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 22, fontWeight: 500, color: SI_COLORS.ink,
              letterSpacing: '-0.01em',
            }}>{bParcel.eta}</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, marginTop: 16 }}>
        {state.driverBAlert && !state.driverBAccepted && (
          <div style={{
            padding: '18px 18px 16px',
            background: SI_COLORS.surfaceUp,
            border: `1px solid ${SI_COLORS.amber}`,
            borderLeft: `4px solid ${SI_COLORS.amber}`,
            borderRadius: 14,
            animation: 'siSlide .4s ease-out',
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 10, color: 'oklch(50% 0.10 75)',
              letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: SI_COLORS.amber }} />
              Otto · proactive alert
            </div>
            <div style={{
              fontFamily: SI_HEAD_FONT, fontStyle: 'italic',
              fontSize: 17, color: SI_COLORS.ink, lineHeight: 1.4,
            }}>"A colleague just reported Maple Street is closed. Want me to show an alternate route?"</div>
            <SIWave mode="speaking" compact />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={dismissB} style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                background: SI_COLORS.surface, border: `1px solid ${SI_COLORS.hair}`,
                fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500,
                color: SI_COLORS.inkSoft, cursor: 'pointer',
              }}>No, thanks</button>
              <button onClick={acceptB} style={{
                flex: 1.4, padding: '10px 12px', borderRadius: 10,
                background: SI_COLORS.sageDeep, border: `1px solid ${SI_COLORS.sageDeep}`,
                fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 600,
                color: '#fff', cursor: 'pointer',
              }}>Yes — show route</button>
            </div>
          </div>
        )}

        {state.driverBAccepted && (
          <div style={{
            padding: '14px 16px',
            background: SI_COLORS.surfaceUp,
            border: `1px solid ${SI_COLORS.hair}`,
            borderRadius: 14,
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 10, color: SI_COLORS.sageDeep,
              letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
              marginBottom: 10,
            }}>Alternate route active · +8m</div>
            <div style={{
              height: 130, borderRadius: 10, overflow: 'hidden',
              background: SI_COLORS.bg, border: `1px solid ${SI_COLORS.hair}`,
            }}>
              <svg viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
                {[50,130].map(y => <line key={y} x1="20" y1={y} x2="460" y2={y} stroke={SI_COLORS.hair} strokeWidth="10" strokeLinecap="round" />)}
                <line x1="300" y1="14" x2="300" y2="266" stroke={SI_COLORS.hair} strokeWidth="10" strokeLinecap="round" />
                <polyline points="30,130 300,130" fill="none" stroke={SI_COLORS.inkFaint} strokeWidth="3" strokeDasharray="6 4" />
                <polyline points="30,130 30,50 300,50 300,130" fill="none" stroke={SI_COLORS.sageDeep} strokeWidth="3" strokeLinejoin="round" />
                <line x1="140" y1="120" x2="160" y2="140" stroke={SI_COLORS.rust} strokeWidth="3" />
                <line x1="160" y1="120" x2="140" y2="140" stroke={SI_COLORS.rust} strokeWidth="3" />
              </svg>
            </div>
            <div style={{
              marginTop: 10,
              fontFamily: SI_HEAD_FONT, fontStyle: 'italic',
              fontSize: 14, color: SI_COLORS.inkSoft, lineHeight: 1.4,
            }}>Routing around Maple. Crossing Pine instead — colleagues confirmed parking there.</div>
          </div>
        )}

        {!state.driverBAlert && !state.driverBAccepted && (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            border: `1px dashed ${SI_COLORS.hair}`, borderRadius: 14,
            background: SI_COLORS.surface,
          }}>
            <div style={{
              fontFamily: SI_HEAD_FONT, fontStyle: 'italic',
              fontSize: 18, color: SI_COLORS.inkSoft,
            }}>Awaiting intelligence</div>
            <div style={{
              fontFamily: 'Inter, system-ui', fontSize: 11,
              color: SI_COLORS.inkFaint, letterSpacing: '0.06em',
              maxWidth: 240, textAlign: 'center', lineHeight: 1.5,
            }}>Otto interrupts only when something on Driver A's route changes Driver B's plan.</div>
          </div>
        )}
      </div>

      <style>{`@keyframes siSlide { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

// ============================================================
// Top simulation bar
// ============================================================
function SimBar({ onRunDemo, onReset, running }) {
  const { state, dispatch } = useDemo();
  const Btn = ({ active, label, onClick }) => (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 6,
      background: active ? SI_COLORS.ink : 'transparent',
      color: active ? SI_COLORS.bg : SI_COLORS.inkSoft,
      border: `1px solid ${active ? SI_COLORS.ink : SI_COLORS.hair}`,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', cursor: 'pointer',
    }}>{label}</button>
  );
  return (
    <div style={{
      height: 44, padding: '0 18px',
      borderBottom: `1px solid ${SI_COLORS.hair}`,
      background: SI_COLORS.surface,
      display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
    }}>
      <div style={{
        fontFamily: SI_HEAD_FONT,
        fontSize: 18, fontWeight: 500, color: SI_COLORS.ink,
        letterSpacing: '-0.015em',
      }}>StreetIQ</div>
      <div style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10, color: SI_COLORS.inkFaint, letterSpacing: '0.16em', fontWeight: 600,
      }}>VOICE COPILOT · DEMO</div>

      <div style={{ marginLeft: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'Inter, system-ui', fontSize: 11,
          color: SI_COLORS.inkFaint, fontWeight: 500,
        }}>Driver A</span>
        {['Driving','Approaching','Parked'].map(s =>
          <Btn key={s} label={s} active={state.driverAState === s} onClick={() => dispatch({ type: 'A_STATE', payload: s })} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'Inter, system-ui', fontSize: 11,
          color: SI_COLORS.inkFaint, fontWeight: 500,
        }}>Driver B</span>
        {['Driving','Approaching','Parked'].map(s =>
          <Btn key={s} label={s} active={state.driverBState === s} onClick={() => dispatch({ type: 'B_STATE', payload: s })} />
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {running && (
          <span style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10, color: SI_COLORS.sageDeep,
            letterSpacing: '0.14em', fontWeight: 700,
            animation: 'siPulse 1.4s ease-in-out infinite',
          }}>● DEMO RUNNING</span>
        )}
        <button onClick={onReset} style={{
          padding: '6px 12px', borderRadius: 6,
          background: 'transparent', border: `1px solid ${SI_COLORS.hair}`,
          color: SI_COLORS.inkSoft,
          fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, cursor: 'pointer',
        }}>Reset</button>
        <button onClick={onRunDemo} disabled={running} style={{
          padding: '6px 14px', borderRadius: 6,
          background: SI_COLORS.sageDeep,
          border: `1px solid ${SI_COLORS.sageDeep}`,
          color: '#fff', fontFamily: 'Inter, system-ui',
          fontSize: 11, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
          opacity: running ? 0.5 : 1,
        }}>▶ Run Scripted Demo</button>
      </div>
    </div>
  );
}

// ============================================================
// App
// ============================================================
function StreetIQApp() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  applyPalette(t.palette);
  applyAccent(t.accent);
  applyFont(t.headFont);
  const applyBMW = () => {
    setTweak({ palette: 'BMW silver', accent: 'BMW blue', headFont: 'Space Grotesk' });
  };
  const applyQuiet = () => {
    setTweak({ palette: 'Warm green', accent: 'Sage', headFont: 'Newsreader' });
  };
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [running, setRunning] = React.useState(false);
  const timers = React.useRef([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  React.useEffect(() => () => clear(), []);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05; window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  };

  const processIntent = (intent, entity, transcript) => {
    dispatch({ type: 'TRANSCRIPT', payload: transcript || '' });
    dispatch({ type: 'INTENT', intent, entity });
    dispatch({ type: 'VOICE_MODE', payload: 'speaking' });

    if (intent === 'road_closed') {
      dispatch({ type: 'EVENT', payload: `Driver A · road_closed "${entity || 'Maple Street'}"`, kind: 'alert' });
      dispatch({ type: 'EVENT', payload: 'Reroute generated · +15m delay on P-001, P-002', kind: 'reroute' });
      dispatch({ type: 'ROAD_CLOSED_IMPACT' });
      timers.current.push(setTimeout(() => {
        dispatch({ type: 'B_ALERT', payload: true });
        dispatch({ type: 'EVENT', payload: 'Driver B · proactive alert dispatched', kind: 'alert' });
        speak('A colleague just reported Maple Street is closed. Want me to show an alternate route?');
      }, 2200));
    } else if (intent === 'parking_issue') {
      dispatch({ type: 'EVENT', payload: 'Driver A · parking_issue · +10m on P-001' });
      dispatch({ type: 'PARKING_IMPACT' });
    } else if (intent === 'customer_not_home') {
      dispatch({ type: 'EVENT', payload: 'Driver A · customer_not_home · P-001 rescheduled to 17:00' });
      dispatch({ type: 'NOT_HOME_IMPACT' });
    } else if (intent === 'delivery_complete') {
      dispatch({ type: 'EVENT', payload: 'Driver A · delivery_complete · P-001 delivered' });
      dispatch({ type: 'DELIVERED_IMPACT' });
    }
    timers.current.push(setTimeout(() => dispatch({ type: 'VOICE_MODE', payload: 'standby' }), 1800));
  };

  const micClick = () => {
    dispatch({ type: 'VOICE_MODE', payload: 'listening' });
    timers.current.push(setTimeout(() => {
      processIntent('road_closed', 'Maple Street', 'the road is closed on Maple Street');
    }, 1800));
  };

  const acceptB = () => {
    dispatch({ type: 'B_ACCEPT' });
    dispatch({ type: 'EVENT', payload: 'Driver B · accepted reroute · +8m on P-004', kind: 'reroute' });
    setRunning(false);
  };
  const dismissB = () => {
    dispatch({ type: 'B_ALERT', payload: false });
    dispatch({ type: 'EVENT', payload: 'Driver B · dismissed reroute' });
  };

  const onReset = () => { clear(); setRunning(false); dispatch({ type: 'RESET' }); };

  const onRunDemo = () => {
    onReset();
    setRunning(true);
    timers.current.push(setTimeout(() => {
      dispatch({ type: 'A_STATE', payload: 'Approaching' });
      dispatch({ type: 'EVENT', payload: 'Driver A approaching P-001 · 12 Oak St' });
    }, 600));
    timers.current.push(setTimeout(() => {
      dispatch({ type: 'VOICE_MODE', payload: 'listening' });
    }, 1800));
    timers.current.push(setTimeout(() => {
      processIntent('road_closed', 'Maple Street', 'the road is closed on Maple Street');
    }, 3200));
  };

  return (
    <Ctx.Provider value={{ state, dispatch, processIntent, micClick, acceptB, dismissB }}>
      <div style={{
        width: 1600, height: 900,
        background: SI_COLORS.bg,
        color: SI_COLORS.ink,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative',
      }}>
        <SimBar onRunDemo={onRunDemo} onReset={onReset} running={running} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <PanelShell index="01" title="Voice Cockpit" sub="Driver A" tone="sage">
            <Panel1 />
          </PanelShell>
          <PanelShell index="02" title="Adaptive Map" sub="Driver A · shared layer" tone="amber">
            <Panel2 />
          </PanelShell>
          <PanelShell index="03" title="Dispatch" sub="6 parcels · 2 drivers" tone="rust">
            <Panel3 />
          </PanelShell>
          <PanelShell index="04" title="Proactive Copilot" sub="Driver B" tone="ink2">
            <Panel4 />
          </PanelShell>
        </div>
        {/* footer caption */}
        <div style={{
          height: 26, padding: '0 18px',
          borderTop: `1px solid ${SI_COLORS.hair}`,
          background: SI_COLORS.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 10, color: SI_COLORS.inkFaint,
          letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          <span>Closed-loop demo · A speaks → dispatch updates → B is alerted</span>
          <span>Rev 01 · Quiet aesthetic</span>
        </div>
      </div>
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Presets" />
        <div style={{ display: 'flex', gap: 6, padding: '0 10px 8px' }}>
          <window.TweakButton label="Quiet" onClick={applyQuiet} />
          <window.TweakButton label="BMW" onClick={applyBMW} />
        </div>
        <window.TweakSection label="Background" />
        <window.TweakSelect label="Palette" value={t.palette}
          options={Object.keys(SI_PALETTES)}
          onChange={(v) => setTweak('palette', v)} />
        <window.TweakSection label="Accent" />
        <window.TweakSelect label="Hue" value={t.accent}
          options={Object.keys(SI_ACCENT_HUES)}
          onChange={(v) => setTweak('accent', v)} />
        <window.TweakSection label="Headline font" />
        <window.TweakSelect label="Family" value={t.headFont}
          options={Object.keys(SI_FONTS)}
          onChange={(v) => setTweak('headFont', v)} />
      </window.TweaksPanel>
    </Ctx.Provider>
  );
}

window.StreetIQApp = StreetIQApp;
window.SI_COLORS = SI_COLORS;
