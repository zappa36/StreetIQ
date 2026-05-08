import React, { createContext, useContext, useReducer, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- BMW theme tokens (mirrors index.css :root --si-*) ---
const SI = {
  bg: "#F2F5F9",
  bgDeep: "#F8FAFC",
  surface: "#FAFBFD",
  surfaceUp: "#FFFFFF",
  hair: "#CFD6DF",
  hairSoft: "#DDE2EA",
  ink: "#1C1B1A",
  inkSoft: "#5A5752",
  inkFaint: "#8E8B85",
  accent: "oklch(58% 0.16 250)",
  accentDeep: "oklch(42% 0.17 250)",
  accentWash: "oklch(94% 0.03 250)",
  amber: "oklch(74% 0.15 75)",
  amberDeep: "oklch(56% 0.14 75)",
  amberWash: "oklch(95% 0.05 75)",
  rust: "oklch(60% 0.17 30)",
  rustDeep: "oklch(48% 0.16 30)",
  rustWash: "oklch(94% 0.04 30)",
  ink2: "oklch(50% 0.10 245)",
  ink2Deep: "oklch(38% 0.11 245)",
  ink2Wash: "oklch(94% 0.03 245)",
};
const FONT_HEAD = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'Menlo', monospace";

// --- Types ---
type DriverState = "Driving" | "Approaching" | "Parked";
type ParcelStatus = "pending" | "in_transit" | "delivered" | "rescheduled" | "delayed" | "failed";

interface Parcel {
  id: string;
  address: string;
  customer: string;
  driver: "Driver A" | "Driver B";
  eta: string;
  originalEta: string;
  status: ParcelStatus;
  delayReasons: string[];
}

interface EventLog {
  id: string;
  timestamp: string;
  message: string;
}

interface ParkingSpot {
  id: string;
  x: number;
  y: number;
  confirmations: number;
  label: string;
}

type DriverBScenarioId = "maple_closed" | "oak_traffic" | "customer_unavailable" | "parking_tip" | "oak_accident";

type PendingFollowUp =
  | { type: "delay_details"; parcelId: string; parcelLabel: string; question: string; knownMinutes: number | null; knownReason: string | null }
  | { type: "confirm_navigation"; question: string; contextLabel: string }
  | { type: "inbound_alert"; scenarioId: DriverBScenarioId; summary: string; fullMessage: string; question: string };

interface DelayExtras {
  parcelRef?: string;
  minutes?: number;
  reason?: string;
}

interface AppState {
  driverAState: DriverState;
  driverBState: DriverState;
  parcels: Parcel[];
  events: EventLog[];
  mapVisible: boolean;
  mapOpening: boolean;
  roadClosed: boolean;
  driverARerouteOverlayDismissed: boolean;
  driverBAlertVisible: boolean;
  driverBRerouteAccepted: boolean | null;
  heatmapSpots: ParkingSpot[];
  transcript: string;
  lastIntent: string;
  lastEntity: string;
  isListening: boolean;
  isSpeaking: boolean;
  isRunningDemo: boolean;
  pendingFollowUp: PendingFollowUp | null;
}

type Action =
  | { type: "SET_DRIVER_A_STATE"; payload: DriverState }
  | { type: "SET_DRIVER_B_STATE"; payload: DriverState }
  | { type: "ADD_EVENT"; payload: string }
  | { type: "SET_MAP_VISIBLE"; payload: boolean }
  | { type: "SET_MAP_OPENING"; payload: boolean }
  | { type: "SET_ROAD_CLOSED"; payload: boolean }
  | { type: "DISMISS_A_REROUTE_OVERLAY" }
  | { type: "ROAD_CLOSED_IMPACT" }
  | { type: "PARKING_ISSUE_IMPACT" }
  | { type: "CUSTOMER_NOT_HOME_IMPACT" }
  | { type: "DELIVERY_COMPLETE_IMPACT" }
  | { type: "DRIVER_B_ACCEPT_REROUTE" }
  | { type: "SET_B_ALERT_VISIBLE"; payload: boolean }
  | { type: "SET_B_REROUTE_ACCEPTED"; payload: boolean }
  | { type: "INCREMENT_PARKING"; payload: string }
  | { type: "SET_TRANSCRIPT"; payload: string }
  | { type: "SET_INTENT"; payload: { intent: string; entity: string } }
  | { type: "SET_LISTENING"; payload: boolean }
  | { type: "SET_SPEAKING"; payload: boolean }
  | { type: "SET_RUNNING_DEMO"; payload: boolean }
  | { type: "UPDATE_PARCELS"; payload: Parcel[] }
  | { type: "SET_PENDING_FOLLOWUP"; payload: PendingFollowUp }
  | { type: "CLEAR_PENDING_FOLLOWUP" }
  | { type: "APPLY_DELAY"; payload: { parcelId: string; minutes: number; reason: string } }
  | { type: "APPLY_INBOUND_SCENARIO"; payload: { scenarioId: DriverBScenarioId } }
  | { type: "RESET_DEMO" };

// --- Mock Data ---
const INITIAL_PARCELS: Parcel[] = [
  { id: "P001", address: "12 Oak St", customer: "Alice Chen", driver: "Driver A", eta: "14:20", originalEta: "14:20", status: "pending", delayReasons: [] },
  { id: "P002", address: "34 Maple Ave", customer: "Bob Torres", driver: "Driver A", eta: "14:35", originalEta: "14:35", status: "pending", delayReasons: [] },
  { id: "P003", address: "56 Pine Rd", customer: "Carol Wu", driver: "Driver A", eta: "14:50", originalEta: "14:50", status: "pending", delayReasons: [] },
  { id: "P004", address: "78 Maple St", customer: "David Kim", driver: "Driver B", eta: "14:25", originalEta: "14:25", status: "pending", delayReasons: [] },
  { id: "P005", address: "91 Elm Blvd", customer: "Emma Park", driver: "Driver B", eta: "14:40", originalEta: "14:40", status: "pending", delayReasons: [] },
  { id: "P006", address: "103 Cedar Ln", customer: "Frank Li", driver: "Driver B", eta: "14:55", originalEta: "14:55", status: "pending", delayReasons: [] },
];

const INITIAL_SPOTS: ParkingSpot[] = [
  { id: "P-1", x: 80, y: 60, confirmations: 8, label: "Oak St N" },
  { id: "P-2", x: 150, y: 90, confirmations: 5, label: "Oak St S" },
  { id: "P-3", x: 220, y: 70, confirmations: 2, label: "Maple Ave" },
  { id: "P-4", x: 300, y: 120, confirmations: 0, label: "Pine Rd E" },
  { id: "P-5", x: 100, y: 180, confirmations: 11, label: "Oak/Elm" },
  { id: "P-6", x: 250, y: 160, confirmations: 3, label: "Maple St W" },
  { id: "P-7", x: 370, y: 90, confirmations: 6, label: "Cedar Ln" },
  { id: "P-8", x: 320, y: 200, confirmations: 1, label: "Pine/Cedar" },
  { id: "P-9", x: 180, y: 220, confirmations: 9, label: "Elm Blvd" },
  { id: "P-10", x: 400, y: 160, confirmations: 4, label: "Cedar S" },
];

const initialState: AppState = {
  driverAState: "Driving",
  driverBState: "Driving",
  parcels: INITIAL_PARCELS,
  events: [{ id: "e-init", timestamp: "14:18:02", message: "Route 04 dispatched · 6 stops · Driver A + B" }],
  mapVisible: false,
  mapOpening: false,
  roadClosed: false,
  driverARerouteOverlayDismissed: false,
  driverBAlertVisible: false,
  driverBRerouteAccepted: null,
  heatmapSpots: INITIAL_SPOTS,
  transcript: "",
  lastIntent: "",
  lastEntity: "",
  isListening: false,
  isSpeaking: false,
  isRunningDemo: false,
  pendingFollowUp: null,
};

// --- Driver B → Driver A scenarios (Panel 4 buttons) ---
const DRIVER_B_SCENARIOS: Record<DriverBScenarioId, {
  label: string;
  shortHint: string;
  summary: string;
  fullMessage: string;
  tone: "amber" | "rust" | "accent";
}> = {
  maple_closed: {
    label: "Maple Ave closed (construction)",
    shortHint: "Reroute P002 via 2nd Ave, +10 min",
    summary: "Maple Avenue closed for construction",
    fullMessage: "Driver B just reported Maple Avenue is closed for construction. I've rerouted parcel two — 34 Maple Avenue — via 2nd Avenue. New ETA pushed back ten minutes.",
    tone: "amber",
  },
  oak_traffic: {
    label: "Heavy traffic on Oak St",
    shortHint: "Re-sequence: P002 before P001",
    summary: "Heavy traffic on Oak Street",
    fullMessage: "Driver B reports heavy traffic on Oak Street. I've re-sequenced your route — head to parcel two on Maple Avenue first, then come back to parcel one on Oak Street. Traffic should clear in fifteen minutes.",
    tone: "amber",
  },
  customer_unavailable: {
    label: "P001 customer not home",
    shortHint: "Reschedule P001 to 17:00, push to end",
    summary: "Customer at P001 not home until 5 PM",
    fullMessage: "Driver B passed along a message from dispatch. The customer at parcel one on Oak Street isn't home until 5 PM. I've moved it to the end of your route — go straight to parcel two on Maple Avenue.",
    tone: "amber",
  },
  parking_tip: {
    label: "Free parking on Pine Rd",
    shortHint: "Boost Pine Rd East parking hotspot",
    summary: "Open parking spot near Pine Road",
    fullMessage: "Quick tip from Driver B — there's open parking on Pine Road East right next to parcel three. I've marked it on your map.",
    tone: "accent",
  },
  oak_accident: {
    label: "Accident on Oak St",
    shortHint: "Reroute P001 via Birch St, +15 min",
    summary: "Accident blocking Oak Street",
    fullMessage: "Driver B just witnessed an accident blocking Oak Street near parcel one. I've rerouted you via Birch Street — adds about fifteen minutes.",
    tone: "rust",
  },
};

// --- Helper ---
function addMinutes(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}

// --- Reducer ---
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DRIVER_A_STATE": {
      let newState = { ...state, driverAState: action.payload };
      if (action.payload === "Parked" && state.driverAState !== "Parked") {
        newState.heatmapSpots = state.heatmapSpots.map((s) =>
          s.id === "P-2" ? { ...s, confirmations: s.confirmations + 1 } : s
        );
      }
      return newState;
    }
    case "SET_DRIVER_B_STATE":
      return { ...state, driverBState: action.payload };
    case "ADD_EVENT": {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
      const newEvent = { id: Math.random().toString(), timestamp: timeStr, message: action.payload };
      return { ...state, events: [newEvent, ...state.events].slice(0, 20) };
    }
    case "SET_MAP_VISIBLE":
      return { ...state, mapVisible: action.payload, mapOpening: action.payload ? false : state.mapOpening };
    case "SET_MAP_OPENING":
      return { ...state, mapOpening: action.payload };
    case "SET_ROAD_CLOSED":
      return { ...state, roadClosed: action.payload, driverARerouteOverlayDismissed: false };
    case "DISMISS_A_REROUTE_OVERLAY":
      return { ...state, driverARerouteOverlayDismissed: true };
    case "ROAD_CLOSED_IMPACT":
      return {
        ...state,
        roadClosed: true,
        driverARerouteOverlayDismissed: false,
        parcels: state.parcels.map((p) =>
          p.id === "P001" || p.id === "P002"
            ? { ...p, status: "delayed" as ParcelStatus, eta: addMinutes(p.eta, 15) }
            : p
        ),
      };
    case "PARKING_ISSUE_IMPACT":
      return {
        ...state,
        parcels: state.parcels.map((p) =>
          p.id === "P001" ? { ...p, status: "delayed" as ParcelStatus, eta: addMinutes(p.eta, 10) } : p
        ),
      };
    case "CUSTOMER_NOT_HOME_IMPACT":
      return {
        ...state,
        parcels: state.parcels.map((p) =>
          p.id === "P001" ? { ...p, status: "rescheduled" as ParcelStatus, eta: "17:00" } : p
        ),
      };
    case "DELIVERY_COMPLETE_IMPACT":
      return {
        ...state,
        mapVisible: false,
        mapOpening: false,
        driverAState: "Driving",
        parcels: state.parcels.map((p) =>
          p.id === "P001" ? { ...p, status: "delivered" as ParcelStatus } : p
        ),
      };
    case "DRIVER_B_ACCEPT_REROUTE":
      return {
        ...state,
        driverBRerouteAccepted: true,
        driverBAlertVisible: false,
        isRunningDemo: false,
        parcels: state.parcels.map((p) =>
          p.id === "P004" ? { ...p, eta: addMinutes(p.eta, 15) } : p
        ),
      };
    case "SET_B_ALERT_VISIBLE":
      return { ...state, driverBAlertVisible: action.payload };
    case "SET_B_REROUTE_ACCEPTED":
      return { ...state, driverBRerouteAccepted: action.payload };
    case "INCREMENT_PARKING":
      return {
        ...state,
        heatmapSpots: state.heatmapSpots.map((s) => (s.id === action.payload ? { ...s, confirmations: s.confirmations + 1 } : s)),
      };
    case "SET_TRANSCRIPT":
      return { ...state, transcript: action.payload };
    case "SET_INTENT":
      return { ...state, lastIntent: action.payload.intent, lastEntity: action.payload.entity };
    case "SET_LISTENING":
      return { ...state, isListening: action.payload };
    case "SET_SPEAKING":
      return { ...state, isSpeaking: action.payload };
    case "SET_RUNNING_DEMO":
      return { ...state, isRunningDemo: action.payload };
    case "UPDATE_PARCELS":
      return { ...state, parcels: action.payload };
    case "SET_PENDING_FOLLOWUP":
      return { ...state, pendingFollowUp: action.payload };
    case "CLEAR_PENDING_FOLLOWUP":
      return { ...state, pendingFollowUp: null };
    case "APPLY_INBOUND_SCENARIO": {
      const sid = action.payload.scenarioId;
      if (sid === "maple_closed") {
        return {
          ...state,
          parcels: state.parcels.map((p) =>
            p.id === "P002"
              ? { ...p, status: "delayed" as ParcelStatus, eta: addMinutes(p.eta, 10), delayReasons: [...(p.delayReasons ?? []), "+10min · Maple Ave closed"] }
              : p
          ),
        };
      }
      if (sid === "oak_traffic") {
        const next = [...state.parcels];
        const i1 = next.findIndex((p) => p.id === "P001");
        const i2 = next.findIndex((p) => p.id === "P002");
        if (i1 >= 0 && i2 >= 0) [next[i1], next[i2]] = [next[i2], next[i1]];
        return { ...state, parcels: next };
      }
      if (sid === "customer_unavailable") {
        const aParcels = state.parcels.filter((p) => p.driver === "Driver A");
        const others = state.parcels.filter((p) => p.driver !== "Driver A");
        const reordered = [
          ...aParcels.filter((p) => p.id !== "P001"),
          ...aParcels
            .filter((p) => p.id === "P001")
            .map((p) => ({ ...p, status: "rescheduled" as ParcelStatus, eta: "17:00", delayReasons: [...(p.delayReasons ?? []), "rescheduled · customer not home"] })),
        ];
        return { ...state, parcels: [...reordered, ...others] };
      }
      if (sid === "parking_tip") {
        return {
          ...state,
          heatmapSpots: state.heatmapSpots.map((s) =>
            s.id === "P-4" ? { ...s, confirmations: s.confirmations + 5 } : s
          ),
        };
      }
      if (sid === "oak_accident") {
        return {
          ...state,
          parcels: state.parcels.map((p) =>
            p.id === "P001"
              ? { ...p, status: "delayed" as ParcelStatus, eta: addMinutes(p.eta, 15), delayReasons: [...(p.delayReasons ?? []), "+15min · accident on Oak St"] }
              : p
          ),
        };
      }
      return state;
    }
    case "APPLY_DELAY":
      return {
        ...state,
        pendingFollowUp: null,
        parcels: state.parcels.map((p) =>
          p.id === action.payload.parcelId
            ? {
                ...p,
                status: "delayed" as ParcelStatus,
                eta: addMinutes(p.eta, action.payload.minutes),
                delayReasons: [...(p.delayReasons ?? []), `+${action.payload.minutes}min · ${action.payload.reason}`],
              }
            : p
        ),
      };
    case "RESET_DEMO":
      return initialState;
    default:
      return state;
  }
}

// --- Context ---
const DemoContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  processIntent: (intent: string, entity: string, extras?: DelayExtras) => void;
  triggerInboundAlert: (scenarioId: DriverBScenarioId) => void;
  playTtsAlert: (text: string) => void;
} | null>(null);

function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}

// ============================================================
// SIWave — animated EQ-bar waveform
// ============================================================
function SIWave({ mode, compact = false }: { mode: "standby" | "listening" | "speaking"; compact?: boolean }) {
  const heights = compact
    ? [10, 18, 28, 36, 22, 14, 26, 38, 30, 18, 12, 22, 32, 24, 16]
    : [14, 26, 40, 56, 72, 84, 64, 46, 32, 50, 70, 86, 64, 44, 28, 18, 12, 20, 34, 48, 30, 18];
  const active = mode === "listening" || mode === "speaking";
  const color = mode === "listening" ? SI.accentDeep : mode === "speaking" ? SI.accent : SI.inkFaint;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: compact ? 4 : 5, height: compact ? 44 : 88 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: compact ? 3 : 5,
            borderRadius: 2,
            background: color,
            height: h,
            opacity: active ? 0.95 : 0.28,
            animation: active ? `si-bar 0.9s ease-in-out ${i * 0.05}s infinite alternate` : "none",
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// PanelShell — chrome with 3px accent rule + "PANEL 0N" label
// ============================================================
function PanelShell({
  index,
  title,
  sub,
  tone = "accent",
  bg,
  children,
}: {
  index: string;
  title: string;
  sub?: string;
  tone?: "accent" | "amber" | "rust" | "ink2";
  bg: string;
  children: React.ReactNode;
}) {
  const accent =
    tone === "amber" ? SI.amberDeep : tone === "rust" ? SI.rustDeep : tone === "ink2" ? SI.ink2Deep : SI.accentDeep;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        background: bg,
        borderRight: `1px solid ${SI.hair}`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <div
        style={{
          padding: "14px 18px 12px",
          borderBottom: `1px solid ${SI.hair}`,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          position: "relative",
          minHeight: 54,
        }}
      >
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: accent,
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          PANEL {index}
        </span>
        <span
          style={{
            fontFamily: FONT_HEAD,
            fontSize: 17,
            fontWeight: 500,
            color: SI.ink,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
        {sub && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: SI.inkFaint,
              letterSpacing: "0.04em",
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ============================================================
// Top simulation bar (44px)
// ============================================================
function TopBar({
  state,
  dispatch,
  onRunDemo,
  onReset,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onRunDemo: () => void;
  onReset: () => void;
}) {
  const segBtn = (active: boolean) => ({
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: "0.14em",
    fontWeight: 600,
    padding: "5px 10px",
    background: active ? SI.accentDeep : SI.surface,
    color: active ? "#fff" : SI.inkSoft,
    border: `1px solid ${active ? SI.accentDeep : SI.hair}`,
    borderRadius: 4,
    cursor: "pointer",
    transition: "all .2s",
  });

  return (
    <div
      style={{
        height: 44,
        background: SI.surface,
        borderBottom: `1px solid ${SI.hair}`,
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 18,
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: SI.ink, letterSpacing: "-0.01em" }}>
        StreetIQ
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: SI.inkFaint,
          letterSpacing: "0.18em",
          fontWeight: 600,
        }}
      >
        VOICE COPILOT · DEMO
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 24 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.inkFaint, letterSpacing: "0.14em" }}>DRIVER A</span>
        {(["Driving", "Approaching", "Parked"] as DriverState[]).map((s) => (
          <button
            key={s}
            data-testid={`btn-sim-a-${s}`}
            onClick={() => dispatch({ type: "SET_DRIVER_A_STATE", payload: s })}
            style={segBtn(state.driverAState === s)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.inkFaint, letterSpacing: "0.14em" }}>DRIVER B</span>
        {(["Driving", "Approaching", "Parked"] as DriverState[]).map((s) => (
          <button
            key={s}
            data-testid={`btn-sim-b-${s}`}
            onClick={() => dispatch({ type: "SET_DRIVER_B_STATE", payload: s })}
            style={segBtn(state.driverBState === s)}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {state.isRunningDemo && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.amberDeep,
              letterSpacing: "0.14em",
              animation: "si-live-pulse 1.6s ease-in-out infinite",
            }}
          >
● DEMO RUNNING
          </span>
        )}
        <button
          data-testid="btn-sim-reset"
          onClick={onReset}
          style={{
            fontFamily: FONT_BODY,
            fontSize: 12,
            color: SI.inkSoft,
            background: "transparent",
            border: `1px solid ${SI.hair}`,
            padding: "5px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Reset
        </button>
        <button
          data-testid="btn-sim-run"
          onClick={onRunDemo}
          disabled={state.isRunningDemo}
          style={{
            fontFamily: FONT_BODY,
            fontSize: 12,
            color: "#fff",
            background: SI.accentDeep,
            border: `1px solid ${SI.accentDeep}`,
            padding: "5px 14px",
            borderRadius: 4,
            cursor: state.isRunningDemo ? "not-allowed" : "pointer",
            opacity: state.isRunningDemo ? 0.55 : 1,
            fontWeight: 600,
          }}
        >
          ▶ Run Scripted Demo
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Bottom strip (26px)
// ============================================================
function BottomStrip() {
  return (
    <div
      style={{
        height: 26,
        background: SI.surface,
        borderTop: `1px solid ${SI.hair}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        flexShrink: 0,
        fontFamily: FONT_MONO,
        fontSize: 10,
        color: SI.inkFaint,
        letterSpacing: "0.14em",
      }}
    >
      <span>CLOSED-LOOP DEMO · A SPEAKS → DISPATCH UPDATES → B IS ALERTED</span>
      <span>BMW · OPS CONSOLE</span>
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearDemoTimers = () => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
  };

  useEffect(() => () => clearDemoTimers(), []);

  // Proactive announcement when Driver A transitions into "Approaching".
  const prevDriverAStateRef = useRef(state.driverAState);
  useEffect(() => {
    if (prevDriverAStateRef.current !== "Approaching" && state.driverAState === "Approaching") {
      const nextStop = stateRef.current.parcels.find(
        (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed")
      );
      const where = nextStop ? `to ${nextStop.address}` : "your next stop";
      const question = `You're getting close ${where}. Want me to open the navigation app and show some parking hotspots nearby?`;
      dispatch({
        type: "SET_PENDING_FOLLOWUP",
        payload: {
          type: "confirm_navigation",
          question,
          contextLabel: nextStop ? `${nextStop.id} — ${nextStop.address}` : "next stop",
        },
      });
      dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: approach prompt (awaiting yes/no)` });
      playTtsAlert(question);
    }
    prevDriverAStateRef.current = state.driverAState;
  }, [state.driverAState]);

  const playTtsAlert = async (text: string) => {
    const markStart = () => dispatch({ type: "SET_SPEAKING", payload: true });
    const markEnd = () => dispatch({ type: "SET_SPEAKING", payload: false });
    try {
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova" }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        markStart();
        audio.onended = markEnd;
        audio.onerror = markEnd;
        audio.play().catch(markEnd);
        return;
      }
    } catch {
      /* fall through */
    }
    if ("speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1;
      utt.onstart = markStart;
      utt.onend = markEnd;
      utt.onerror = markEnd;
      window.speechSynthesis.speak(utt);
    }
  };

  const resolveDelayParcel = (ref: string | undefined): Parcel | null => {
    const aRoute = stateRef.current.parcels.filter((p) => p.driver === "Driver A");
    const aOpen = aRoute.filter((p) => p.status === "pending" || p.status === "delayed");
    if (aRoute.length === 0) return null;
    const isAtStop = stateRef.current.driverAState === "Parked" || stateRef.current.driverAState === "Approaching";
    const cleaned = (ref ?? "").toLowerCase().trim();
    if (!cleaned || /\b(next|upcoming|following)\b/.test(cleaned)) {
      if (aOpen.length === 0) return null;
      return isAtStop ? (aOpen[1] ?? aOpen[0]) : aOpen[0];
    }
    const idMatch = cleaned.match(/p\s*0*([1-9]\d*)/);
    if (idMatch) {
      const id = `P${idMatch[1].padStart(3, "0")}`;
      const byId = aRoute.find((p) => p.id === id);
      if (byId) return byId;
    }
    const ordinalWords: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
    let n: number | null = null;
    const numMatch = cleaned.match(/\b(\d+)\b/);
    if (numMatch) n = parseInt(numMatch[1], 10);
    else {
      for (const [w, v] of Object.entries(ordinalWords)) {
        if (cleaned.includes(w)) {
          n = v;
          break;
        }
      }
    }
    if (n !== null && n >= 1) {
      const byNumberId = aRoute.find((p) => p.id === `P${String(n).padStart(3, "0")}`);
      if (byNumberId) return byNumberId;
      if (n <= aRoute.length) return aRoute[n - 1];
    }
    const byStreet = aRoute.find((p) => cleaned && p.address.toLowerCase().includes(cleaned));
    if (byStreet) return byStreet;
    const byStreetWord = aRoute.find((p) => {
      const words = cleaned.split(/\s+/);
      return words.some((w) => w.length > 2 && p.address.toLowerCase().includes(w));
    });
    if (byStreetWord) return byStreetWord;
    if (aOpen.length === 0) return null;
    return isAtStop ? (aOpen[1] ?? aOpen[0]) : aOpen[0];
  };

  const processIntent = (intent: string, entity: string, extras: DelayExtras = {}) => {
    console.log("[StreetIQ] processIntent", { intent, entity, extras });
    dispatch({ type: "SET_INTENT", payload: { intent, entity } });

    if (intent === "road_closed") {
      dispatch({ type: "ADD_EVENT", payload: `Driver A: road_closed "${entity || "Maple Ave"}"` });
      dispatch({ type: "ADD_EVENT", payload: `REROUTE ALERT: Generating alternate routes...` });
      dispatch({ type: "ROAD_CLOSED_IMPACT" });
      setTimeout(() => {
        dispatch({ type: "SET_B_ALERT_VISIBLE", payload: true });
        playTtsAlert("A colleague just reported Maple Street is closed. Want me to show an alternate route?");
      }, 2500);
    } else if (intent === "parking_issue") {
      dispatch({ type: "ADD_EVENT", payload: `Driver A: parking_issue reported` });
      dispatch({ type: "PARKING_ISSUE_IMPACT" });
    } else if (intent === "customer_not_home") {
      dispatch({ type: "ADD_EVENT", payload: `Driver A: customer_not_home` });
      dispatch({ type: "CUSTOMER_NOT_HOME_IMPACT" });
    } else if (intent === "delivery_complete") {
      dispatch({ type: "ADD_EVENT", payload: `Driver A: delivery_complete P001` });
      dispatch({ type: "DELIVERY_COMPLETE_IMPACT" });
    } else if (intent === "request_map") {
      dispatch({ type: "ADD_EVENT", payload: `Driver A: request_map` });
      dispatch({ type: "SET_MAP_VISIBLE", payload: true });
    } else if (intent === "delay_reported") {
      const target = resolveDelayParcel(extras.parcelRef);
      if (target) {
        const label = `${target.id} — ${target.address} (${target.customer})`;
        if (typeof extras.minutes === "number" && extras.reason) {
          dispatch({ type: "APPLY_DELAY", payload: { parcelId: target.id, minutes: extras.minutes, reason: extras.reason } });
          dispatch({ type: "SET_INTENT", payload: { intent: "delay_reported", entity: `${target.id} +${extras.minutes}min · ${extras.reason}` } });
          dispatch({ type: "ADD_EVENT", payload: `Driver A: ${target.id} delayed +${extras.minutes}min — ${extras.reason}` });
          playTtsAlert(`Got it. ${target.id} on ${target.address} pushed back ${extras.minutes} minutes due to ${extras.reason}.`);
        } else {
          const missing: string[] = [];
          if (typeof extras.minutes !== "number") missing.push("how long");
          if (!extras.reason) missing.push("what happened");
          const question =
            missing.length === 2
              ? "How long will the delay be, and what happened?"
              : missing[0] === "how long"
                ? "How long will the delay be?"
                : "What happened?";
          dispatch({
            type: "SET_PENDING_FOLLOWUP",
            payload: { type: "delay_details", parcelId: target.id, parcelLabel: label, question, knownMinutes: extras.minutes ?? null, knownReason: extras.reason ?? null },
          });
          dispatch({ type: "ADD_EVENT", payload: `Driver A: delay_reported for ${target.id} (${target.address})` });
          playTtsAlert(`Got it. For ${target.address}, ${question}`);
        }
      } else {
        dispatch({ type: "ADD_EVENT", payload: `Driver A: delay_reported but no matching parcel found` });
      }
    }
  };

  const triggerInboundAlert = (scenarioId: DriverBScenarioId) => {
    const sc = DRIVER_B_SCENARIOS[scenarioId];
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: ${sc.summary}` });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: relaying alert (awaiting yes/no)` });
    const question = `New notification from Driver B about ${sc.summary.toLowerCase()}. Would you like to hear it?`;
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "inbound_alert", scenarioId, summary: sc.summary, fullMessage: sc.fullMessage, question },
    });
    playTtsAlert(`You have a new notification from Driver B. Would you like to hear it?`);
  };

  const handleRunDemo = () => {
    clearDemoTimers();
    dispatch({ type: "RESET_DEMO" });
    dispatch({ type: "SET_RUNNING_DEMO", payload: true });
    demoTimers.current.push(
      setTimeout(() => {
        dispatch({ type: "SET_DRIVER_A_STATE", payload: "Approaching" });
        dispatch({ type: "ADD_EVENT", payload: `Driver A approaching P001` });
      }, 500),
      setTimeout(() => {
        dispatch({ type: "SET_TRANSCRIPT", payload: "road is closed on Maple Street" });
        dispatch({ type: "SET_INTENT", payload: { intent: "road_closed", entity: "Maple Street" } });
        dispatch({ type: "ADD_EVENT", payload: `Driver A: road_closed "Maple Street"` });
        dispatch({ type: "ADD_EVENT", payload: `REROUTE ALERT: Generating alternate routes...` });
        dispatch({ type: "ROAD_CLOSED_IMPACT" });
      }, 2000),
      setTimeout(() => {
        dispatch({ type: "SET_B_ALERT_VISIBLE", payload: true });
        playTtsAlert("A colleague just reported Maple Street is closed. Want me to show an alternate route?");
      }, 4500),
      setTimeout(() => {
        dispatch({ type: "ADD_EVENT", payload: `Driver B accepted reroute for P004` });
        dispatch({ type: "DRIVER_B_ACCEPT_REROUTE" });
      }, 8000),
    );
  };

  const handleReset = () => {
    clearDemoTimers();
    dispatch({ type: "RESET_DEMO" });
  };

  return (
    <DemoContext.Provider value={{ state, dispatch, processIntent, triggerInboundAlert, playTtsAlert }}>
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          background: SI.bg,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT_BODY,
          color: SI.ink,
          overflow: "hidden",
        }}
      >
        <TopBar state={state} dispatch={dispatch} onRunDemo={handleRunDemo} onReset={handleReset} />

        {/* 1×4 panel row — falls back to horizontal scroll under 1280px */}
        <div className="si-panel-row" style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflowX: "auto" }}>
          <PanelShell index="01" title="Voice Cockpit" sub="Driver A" tone="accent" bg={SI.bg}>
            <PanelOne />
          </PanelShell>
          <PanelShell index="02" title="Adaptive Map" sub="shared layer" tone="amber" bg={SI.bgDeep}>
            <PanelTwo />
          </PanelShell>
          <PanelShell index="03" title="Dispatch" sub="6 stops · 2 drivers" tone="rust" bg={SI.bg}>
            <PanelThree />
          </PanelShell>
          <PanelShell index="04" title="Proactive Copilot" sub="Driver B → A" tone="ink2" bg={SI.bgDeep}>
            <PanelFour />
          </PanelShell>
        </div>

        <BottomStrip />
      </div>
    </DemoContext.Provider>
  );
}

// ============================================================
// Panel 01 — Voice Cockpit (Driver A)
// ============================================================
function PanelOne() {
  const { state, dispatch, processIntent, playTtsAlert } = useDemo();

  const playInboundTts = (text: string) => playTtsAlert(text);

  const acceptInboundAlert = (alert: { scenarioId: DriverBScenarioId; summary: string; fullMessage: string }) => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: alert.scenarioId } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: accepted alert "${alert.summary}"` });
    dispatch({ type: "APPLY_INBOUND_SCENARIO", payload: { scenarioId: alert.scenarioId } });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: ${alert.fullMessage}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    playInboundTts(alert.fullMessage);
  };

  const declineInboundAlert = (alert: { summary: string }) => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_no", entity: "" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: dismissed alert "${alert.summary}"` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
  };

  const followUpRef = useRef(state.pendingFollowUp);
  useEffect(() => {
    followUpRef.current = state.pendingFollowUp;
  }, [state.pendingFollowUp]);

  const handleMicClick = async () => {
    if (state.isListening) return;
    dispatch({ type: "SET_LISTENING", payload: true });
    try {
      const SpeechRecognitionCtor =
        (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
        (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = async (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          dispatch({ type: "SET_TRANSCRIPT", payload: transcript });
          await routeTranscript(transcript);
          dispatch({ type: "SET_LISTENING", payload: false });
        };
        recognition.onerror = () => {
          dispatch({ type: "SET_LISTENING", payload: false });
        };
        recognition.start();
      } else {
        setTimeout(async () => {
          const pending = followUpRef.current;
          let fallback: string;
          if (pending?.type === "delay_details") fallback = "about 15 minutes, heavy traffic";
          else if (pending?.type === "confirm_navigation") fallback = "yes please";
          else fallback = "I will be delayed for the next parcel";
          dispatch({ type: "SET_TRANSCRIPT", payload: fallback });
          await routeTranscript(fallback);
          dispatch({ type: "SET_LISTENING", payload: false });
        }, 2000);
      }
    } catch {
      dispatch({ type: "SET_LISTENING", payload: false });
    }
  };

  const looksLikeFreshIntent = (text: string) => {
    const t = text.toLowerCase();
    return (
      /\b(delay|late|behind|delivery|parcel|stop|road|closed|blocked|parking|park|customer|not home|delivered|map|navigate|naviga)\b/.test(t) &&
      /\b(next|another|again|also|more|delivery\s*\d|parcel\s*\d|stop\s*\d|p0*\d+)\b/.test(t)
    );
  };

  const parseYesNo = (text: string): "yes" | "no" | null => {
    const lower = text.toLowerCase();
    if (/\b(yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|read it|sounds good|tell me|let'?s hear)\b/.test(lower)) return "yes";
    if (/\b(no|nope|nah|skip|dismiss|not now|later|cancel)\b/.test(lower)) return "no";
    return null;
  };

  const handleInboundAnswer = (text: string, alert: { scenarioId: DriverBScenarioId; summary: string; fullMessage: string }) => {
    const ans = parseYesNo(text);
    if (ans === "yes") acceptInboundAlert(alert);
    else if (ans === "no") declineInboundAlert(alert);
    else acceptInboundAlert(alert);
  };

  const routeTranscript = async (text: string) => {
    const pending = followUpRef.current;
    if (pending && pending.type === "delay_details" && !looksLikeFreshIntent(text)) {
      await handleDelayDetails(text, pending);
    } else if (pending && pending.type === "confirm_navigation" && !looksLikeFreshIntent(text)) {
      handleNavigationAnswer(text);
    } else if (pending && pending.type === "inbound_alert" && !looksLikeFreshIntent(text)) {
      handleInboundAnswer(text, pending);
    } else {
      if (pending) dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
      await classifyTranscript(text);
    }
  };

  const acceptNavigation = () => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: "" } });
    dispatch({ type: "SET_MAP_OPENING", payload: true });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: confirmed → opening navigation…` });
    playTtsAlert("Opening the map and pulling up parking hotspots near you.");
    setTimeout(() => {
      dispatch({ type: "SET_MAP_VISIBLE", payload: true });
      dispatch({ type: "ADD_EVENT", payload: `Map opened — parking hotspots loaded` });
      dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    }, 1800);
  };

  const declineNavigation = () => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_no", entity: "" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: declined navigation prompt` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
  };

  const handleNavigationAnswer = (text: string) => {
    const lower = text.toLowerCase().trim();
    const yes = /\b(yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|open( it)?|show|sounds good|go ahead)\b/.test(lower);
    if (yes) acceptNavigation();
    else declineNavigation();
  };

  const handleDelayDetails = async (text: string, pending: Extract<PendingFollowUp, { type: "delay_details" }>) => {
    let minutes = pending.knownMinutes ?? 10;
    let reason = pending.knownReason ?? "unspecified";
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mode: "delay_details" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Number.isFinite(data.minutes)) minutes = Math.max(1, Math.round(data.minutes));
        if (typeof data.reason === "string" && data.reason.length > 0) reason = data.reason;
      } else {
        const fb = parseDelayKeywords(text);
        minutes = fb.minutes;
        reason = fb.reason;
      }
    } catch {
      const fb = parseDelayKeywords(text);
      minutes = fb.minutes;
      reason = fb.reason;
    }
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_details", entity: `+${minutes}min · ${reason}` } });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: pending.parcelId, minutes, reason } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: ${pending.parcelId} delayed +${minutes}min — ${reason}` });
  };

  const parseDelayKeywords = (text: string): { minutes: number; reason: string } => {
    const lower = text.toLowerCase();
    const minMatch = lower.match(/(\d+)\s*(?:minute|min)/);
    const hourMatch = lower.match(/(\d+)\s*hour/);
    let minutes = 10;
    if (minMatch) minutes = Math.max(1, parseInt(minMatch[1], 10));
    else if (hourMatch) minutes = Math.max(1, parseInt(hourMatch[1], 10) * 60);
    let reason = "unspecified";
    if (lower.includes("traffic")) reason = "heavy traffic";
    else if (lower.includes("tire") || lower.includes("flat")) reason = "flat tire";
    else if (lower.includes("accident")) reason = "accident on route";
    else if (lower.includes("customer")) reason = "long customer interaction";
    return { minutes, reason };
  };

  const classifyTranscript = async (text: string) => {
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const extras: DelayExtras = {};
        if (typeof data.parcelRef === "string") extras.parcelRef = data.parcelRef;
        if (typeof data.minutes === "number") extras.minutes = data.minutes;
        if (typeof data.reason === "string" && data.reason.length > 0) extras.reason = data.reason;
        processIntent(data.intent, data.entity, extras);
        return;
      }
    } catch {
      /* fallback */
    }
    const lower = text.toLowerCase();
    if (lower.includes("closed") || lower.includes("blocked")) processIntent("road_closed", "Maple Street");
    else if (lower.includes("delay") || lower.includes("late") || lower.includes("behind")) {
      const extras: DelayExtras = {};
      const parcelMatch = lower.match(/\b(?:delivery|stop|parcel|drop)\s*#?\s*(\d+)\b/) || lower.match(/\b(p0*\d+)\b/);
      if (parcelMatch) extras.parcelRef = parcelMatch[1];
      else if (/\bnext\b/.test(lower)) extras.parcelRef = "next";
      const minMatch = lower.match(/(\d+)\s*(?:min|minute|minutes|m)\b/);
      const hourMatch = lower.match(/(\d+)\s*(?:h|hr|hour|hours)\b/);
      if (minMatch) extras.minutes = parseInt(minMatch[1], 10);
      else if (hourMatch) extras.minutes = parseInt(hourMatch[1], 10) * 60;
      else if (/\bhalf an? hour\b/.test(lower)) extras.minutes = 30;
      else if (/\ban hour\b/.test(lower)) extras.minutes = 60;
      const reasonHits = ["traffic", "flat tire", "accident", "construction", "weather", "rain", "snow", "detour", "breakdown"];
      const reason = reasonHits.find((r) => lower.includes(r));
      if (reason) extras.reason = reason;
      processIntent("delay_reported", "", extras);
    } else if (lower.includes("parking") || lower.includes("park")) processIntent("parking_issue", "");
    else if (lower.includes("not home") || lower.includes("nobody")) processIntent("customer_not_home", "");
    else if (lower.includes("delivered") || lower.includes("done")) processIntent("delivery_complete", "");
    else if (lower.includes("map") || lower.includes("navigate")) processIntent("request_map", "");
    else processIntent("general", "");
  };

  const aParcel = state.parcels.find((p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed"));
  const mode: "standby" | "listening" | "speaking" = state.isListening ? "listening" : state.isSpeaking ? "speaking" : "standby";
  const stateColor = state.driverAState === "Driving" ? SI.accent : state.driverAState === "Approaching" ? SI.amber : SI.accentDeep;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px 22px 22px", overflow: "auto" }}>
      {/* state badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: SI.surface,
            border: `1px solid ${SI.hair}`,
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: stateColor }} />
          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: SI.inkSoft,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Driver A · {state.driverAState}
          </span>
        </div>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: SI.inkFaint, letterSpacing: "0.08em" }}>
          {aParcel?.eta ?? "--:--"}
        </span>
      </div>

      {/* parcel card */}
      {aParcel && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            background: SI.surfaceUp,
            border: `1px solid ${SI.hair}`,
            borderRadius: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.inkFaint,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span>Current · {aParcel.id}</span>
            <span>ETA</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 500, color: SI.ink, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
                {aParcel.address}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: SI.inkSoft, marginTop: 2 }}>{aParcel.customer}</div>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 500, color: SI.ink, letterSpacing: "-0.01em" }}>
              {aParcel.eta}
            </div>
          </div>
        </div>
      )}

      {/* Pending follow-up */}
      {state.pendingFollowUp && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="followup-prompt"
          style={{
            marginTop: 16,
            padding: "14px 16px",
            background: SI.surfaceUp,
            borderLeft: `4px solid ${SI.amberDeep}`,
            border: `1px solid ${SI.hair}`,
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.amberDeep,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            StreetIQ asks
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontStyle: "italic", color: SI.ink, lineHeight: 1.4 }}>
            {state.pendingFollowUp.question}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.inkFaint, marginTop: 6, letterSpacing: "0.06em" }}>
            re:{" "}
            {state.pendingFollowUp.type === "delay_details"
              ? state.pendingFollowUp.parcelLabel
              : state.pendingFollowUp.type === "confirm_navigation"
                ? state.pendingFollowUp.contextLabel
                : `Driver B → ${state.pendingFollowUp.summary}`}
          </div>

          {state.pendingFollowUp.type === "inbound_alert" ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                onClick={() => acceptInboundAlert(state.pendingFollowUp as Extract<PendingFollowUp, { type: "inbound_alert" }>)}
                data-testid="btn-inbound-yes"
                style={{
                  flex: 1,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 600,
                  background: SI.accentDeep,
                  color: "#fff",
                  border: "none",
                  padding: "7px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Yes, read it
              </button>
              <button
                onClick={() => declineInboundAlert(state.pendingFollowUp as Extract<PendingFollowUp, { type: "inbound_alert" }>)}
                data-testid="btn-inbound-no"
                style={{
                  flex: 1,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 500,
                  background: SI.surface,
                  color: SI.inkSoft,
                  border: `1px solid ${SI.hair}`,
                  padding: "7px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          ) : state.pendingFollowUp.type === "confirm_navigation" ? (
            state.mapOpening ? (
              <div
                data-testid="map-opening"
                style={{ marginTop: 10, fontFamily: FONT_MONO, fontSize: 11, color: SI.accentDeep, letterSpacing: "0.08em" }}
              >
                ◌ Opening map and parking hotspots…
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  onClick={acceptNavigation}
                  data-testid="btn-followup-yes"
                  style={{
                    flex: 1,
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                    background: SI.accentDeep,
                    color: "#fff",
                    border: "none",
                    padding: "7px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Yes, open map
                </button>
                <button
                  onClick={declineNavigation}
                  data-testid="btn-followup-no"
                  style={{
                    flex: 1,
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 500,
                    background: SI.surface,
                    color: SI.inkSoft,
                    border: `1px solid ${SI.hair}`,
                    padding: "7px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  No thanks
                </button>
              </div>
            )
          ) : (
            <button
              onClick={() => dispatch({ type: "CLEAR_PENDING_FOLLOWUP" })}
              data-testid="btn-cancel-followup"
              style={{
                marginTop: 8,
                fontFamily: FONT_BODY,
                fontSize: 11,
                color: SI.amberDeep,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              cancel
            </button>
          )}
        </motion.div>
      )}

      {/* mic + waveform */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <SIWave mode={mode} />
        <button
          data-testid="btn-mic"
          onClick={handleMicClick}
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: mode === "listening" ? SI.accentDeep : mode === "speaking" ? SI.accent : SI.surface,
            border: `1px solid ${mode === "standby" ? SI.hair : SI.accent}`,
            color: mode === "standby" ? SI.accentDeep : "#fff",
            fontFamily: FONT_HEAD,
            fontSize: 14,
            fontStyle: "italic",
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "all .25s",
            boxShadow: mode !== "standby" ? `0 0 0 8px ${SI.accentWash}` : "none",
          }}
        >
          {mode === "listening" ? "● rec" : mode === "speaking" ? "otto" : "speak"}
        </button>
        <div style={{ minHeight: 56, textAlign: "center", maxWidth: 320 }}>
          {state.transcript ? (
            <>
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontStyle: "italic",
                  fontSize: 15,
                  color: SI.ink,
                  lineHeight: 1.35,
                }}
              >
                “{state.transcript}”
              </div>
              {state.lastIntent && (
                <div style={{ marginTop: 8, display: "inline-flex", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color: SI.accentDeep,
                      background: SI.accentWash,
                      padding: "3px 8px",
                      borderRadius: 4,
                      letterSpacing: "0.1em",
                      fontWeight: 600,
                    }}
                  >
                    {state.lastIntent}
                  </span>
                  {state.lastEntity && (
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        color: SI.inkSoft,
                        border: `1px solid ${SI.hair}`,
                        padding: "3px 8px",
                        borderRadius: 4,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {state.lastEntity}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 11,
                color: SI.inkFaint,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Tap to speak · or say "Hey Otto"
            </div>
          )}
        </div>

        {/* Quick-test transcript chips */}
        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 360 }}>
          {[
            { label: "road closed on Maple", text: "the road is closed on Maple Street" },
            { label: "no parking", text: "I can't find parking" },
            { label: "customer not home", text: "the customer is not home" },
            { label: "delivered", text: "delivered" },
          ].map((c) => (
            <button
              key={c.label}
              data-testid={`btn-chip-${c.label.replace(/\s+/g, "-")}`}
              onClick={async () => {
                dispatch({ type: "SET_TRANSCRIPT", payload: c.text });
                await routeTranscript(c.text);
              }}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 9,
                color: SI.inkSoft,
                background: SI.surfaceUp,
                border: `1px solid ${SI.hair}`,
                padding: "4px 8px",
                borderRadius: 999,
                cursor: "pointer",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Panel 02 — Adaptive Map (Driver A)
// ============================================================
function PanelTwo() {
  const { state } = useDemo();
  const spotColor = (c: number) => {
    if (c === 0) return SI.inkFaint;
    if (c <= 3) return "oklch(82% 0.06 250)";
    if (c <= 7) return "oklch(70% 0.10 250)";
    return SI.accentDeep;
  };

  return (
    <div style={{ height: "100%", padding: 18, position: "relative" }}>
      {!state.mapVisible ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            border: `1px dashed ${SI.hair}`,
            borderRadius: 14,
            background: SI.surface,
          }}
        >
          <div style={{ fontFamily: FONT_HEAD, fontStyle: "italic", fontSize: 22, color: SI.inkSoft }}>Map idle</div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: SI.inkFaint,
              maxWidth: 240,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Map appears only when the driver asks for it, approaches a stop, or accepts a reroute.
          </div>
        </div>
      ) : (
        <div
          style={{
            height: "100%",
            borderRadius: 14,
            overflow: "hidden",
            background: SI.surfaceUp,
            border: `1px solid ${SI.hair}`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${SI.hair}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: SI.surface,
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: SI.accentDeep,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Linden &amp; Maple
            </span>
            {state.roadClosed && (
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: SI.rust,
                  background: SI.rustWash,
                  padding: "3px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                }}
              >
                REROUTE +15m
              </span>
            )}
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <svg viewBox="0 0 480 280" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
              {[50, 130, 220].map((y) => (
                <line key={y} x1="20" y1={y} x2="460" y2={y} stroke={SI.hair} strokeWidth="10" strokeLinecap="round" />
              ))}
              {[120, 300].map((x) => (
                <line key={x} x1={x} y1="14" x2={x} y2="266" stroke={SI.hair} strokeWidth="10" strokeLinecap="round" />
              ))}
              {!state.roadClosed && (
                <polyline
                  points="30,50 120,50 120,130 300,130 300,220 460,220"
                  fill="none"
                  stroke={SI.accentDeep}
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
              )}
              {state.roadClosed && (
                <>
                  <line x1="220" y1="120" x2="240" y2="140" stroke={SI.rust} strokeWidth="3" />
                  <line x1="240" y1="120" x2="220" y2="140" stroke={SI.rust} strokeWidth="3" />
                  <polyline
                    points="30,50 120,50 120,14 300,14 300,130 460,130"
                    fill="none"
                    stroke={SI.amber}
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {state.heatmapSpots.map((s) => (
                <g key={s.id}>
                  <circle cx={s.x} cy={s.y} r="11" fill={spotColor(s.confirmations)} opacity="0.9" />
                  <circle cx={s.x} cy={s.y} r="11" fill="none" stroke={SI.surface} strokeWidth="1.5" />
                </g>
              ))}
              <circle cx="120" cy={state.roadClosed ? 14 : 130} r="6" fill={SI.ink} />
              <circle cx="120" cy={state.roadClosed ? 14 : 130} r="9" fill="none" stroke={SI.ink} strokeWidth="1" opacity="0.4" />
            </svg>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${SI.hair}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: SI.inkFaint, fontWeight: 500 }}>Parking spots:</span>
              {[
                { c: SI.inkFaint, l: "0" },
                { c: "oklch(82% 0.06 250)", l: "1-3" },
                { c: "oklch(70% 0.10 250)", l: "4-7" },
                { c: SI.accentDeep, l: "8+" },
              ].map((s) => (
                <span key={s.l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.c }} />
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.inkFaint }}>{s.l}</span>
                </span>
              ))}
            </div>
            <span style={{ fontFamily: FONT_HEAD, fontStyle: "italic", fontSize: 11, color: SI.inkFaint }}>shared by 47 colleagues</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Panel 03 — Dispatch (parcels + system log)
// ============================================================
function PanelThree() {
  const { state } = useDemo();

  const driverChip = (d: Parcel["driver"]) => {
    const isA = d === "Driver A";
    return {
      bg: isA ? SI.accentWash : SI.ink2Wash,
      color: isA ? SI.accentDeep : SI.ink2Deep,
      label: isA ? "A" : "B",
    };
  };

  const statusChip = (s: ParcelStatus) => {
    switch (s) {
      case "delivered":
        return { bg: SI.accentWash, color: SI.accentDeep };
      case "delayed":
        return { bg: SI.amberWash, color: SI.amberDeep };
      case "rescheduled":
        return { bg: SI.amberWash, color: SI.amberDeep };
      case "failed":
        return { bg: SI.rustWash, color: SI.rustDeep };
      default:
        return { bg: SI.surface, color: SI.inkSoft };
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Parcels table */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["ID", "STOP", "CUSTOMER", "DRV", "ETA"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    color: SI.inkFaint,
                    letterSpacing: "0.18em",
                    fontWeight: 700,
                    textAlign: i >= 3 ? "right" : "left",
                    padding: "0 8px 8px",
                    borderBottom: `1px solid ${SI.hair}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.parcels.map((p) => {
              const dc = driverChip(p.driver);
              const sc = statusChip(p.status);
              return (
                <tr key={p.id} style={{ borderBottom: `1px solid ${SI.hairSoft}` }}>
                  <td style={{ padding: "8px", fontFamily: FONT_MONO, fontSize: 11, color: SI.inkSoft }}>{p.id}</td>
                  <td style={{ padding: "8px" }}>
                    <div style={{ fontFamily: FONT_HEAD, fontSize: 13, color: SI.ink, fontWeight: 500, lineHeight: 1.2 }}>{p.address}</div>
                    {(p.delayReasons ?? []).length > 0 && (
                      <div data-testid={`delay-reasons-${p.id}`} style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {(p.delayReasons ?? []).map((r, i) => (
                          <span
                            key={i}
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 9,
                              color: SI.amberDeep,
                              background: SI.amberWash,
                              padding: "1px 5px",
                              borderRadius: 3,
                              letterSpacing: "0.04em",
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px", fontFamily: FONT_BODY, fontSize: 11, color: SI.inkSoft }}>{p.customer}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        background: dc.bg,
                        color: dc.color,
                        padding: "2px 7px",
                        borderRadius: 4,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {dc.label}
                    </span>
                  </td>
                  <td style={{ padding: "8px", textAlign: "right" }}>
                    {p.eta !== p.originalEta ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: SI.amberDeep, fontWeight: 600 }}>{p.eta}</span>
                        <span
                          data-testid={`original-eta-${p.id}`}
                          style={{ fontFamily: FONT_MONO, fontSize: 9, color: SI.inkFaint, textDecoration: "line-through" }}
                        >
                          was {p.originalEta}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: SI.ink, fontWeight: 500 }}>{p.eta}</span>
                    )}
                    <div style={{ marginTop: 3 }}>
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: sc.color,
                          background: sc.bg,
                          padding: "1px 5px",
                          borderRadius: 3,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          border: `1px solid ${SI.hair}`,
                        }}
                      >
                        {p.status}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* System log strip */}
      <div
        style={{
          height: 220,
          flexShrink: 0,
          background: SI.surface,
          borderTop: `1px solid ${SI.hair}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            borderBottom: `1px solid ${SI.hair}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.ink2Deep,
              letterSpacing: "0.18em",
              fontWeight: 700,
            }}
          >
            SYSTEM LOG
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: SI.accent,
                animation: "si-live-pulse 1.6s ease-in-out infinite",
              }}
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: SI.accentDeep, letterSpacing: "0.18em", fontWeight: 700 }}>LIVE</span>
          </span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 14px" }}>
          <AnimatePresence initial={false}>
            {state.events.map((e) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: e.message.includes("ALERT") ? SI.amberDeep : SI.inkSoft,
                  fontWeight: e.message.includes("ALERT") ? 700 : 400,
                  lineHeight: 1.7,
                  letterSpacing: "0.02em",
                }}
              >
                <span style={{ color: SI.inkFaint, marginRight: 8 }}>[{e.timestamp}]</span>
                {e.message}
              </motion.div>
            ))}
          </AnimatePresence>
          {state.events.length === 0 && (
            <div style={{ fontFamily: FONT_HEAD, fontStyle: "italic", fontSize: 11, color: SI.inkFaint }}>Waiting for events…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Panel 04 — Proactive Copilot (Driver B → Driver A scenario triggers)
// ============================================================
function PanelFour() {
  const { state, dispatch, triggerInboundAlert } = useDemo();
  const bParcel = state.parcels.find((p) => p.driver === "Driver B" && p.status === "pending");
  const pendingAlert = state.pendingFollowUp?.type === "inbound_alert" ? state.pendingFollowUp : null;
  const showProactiveCard = state.driverBAlertVisible;
  const acceptedReroute = state.driverBRerouteAccepted === true;

  const toneColor = (t: "amber" | "rust" | "accent") =>
    t === "amber"
      ? { bar: SI.amberDeep, wash: SI.amberWash, deep: SI.amberDeep }
      : t === "rust"
        ? { bar: SI.rustDeep, wash: SI.rustWash, deep: SI.rustDeep }
        : { bar: SI.accentDeep, wash: SI.accentWash, deep: SI.accentDeep };

  const stateColor = state.driverBState === "Driving" ? SI.ink2 : state.driverBState === "Approaching" ? SI.amber : SI.accentDeep;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "20px 22px 22px", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: SI.surface,
            border: `1px solid ${SI.hair}`,
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: stateColor }} />
          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: SI.inkSoft,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Driver B · {state.driverBState}
          </span>
        </div>
      </div>

      {bParcel && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: SI.surfaceUp,
            border: `1px solid ${SI.hair}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.inkFaint,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {bParcel.id} · ETA {bParcel.eta}
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: SI.ink, fontWeight: 500, marginTop: 2 }}>{bParcel.address}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: SI.inkSoft, marginTop: 1 }}>{bParcel.customer}</div>
        </div>
      )}

      {pendingAlert && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: SI.accentWash,
            border: `1px solid ${SI.hair}`,
            borderRadius: 8,
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: SI.accentDeep,
            letterSpacing: "0.08em",
          }}
        >
          ◌ Sent to Driver A — awaiting yes/no on Panel 01
        </div>
      )}

      {/* Proactive alert card — appears when scripted demo / road-closed pushes alert to B */}
      {showProactiveCard && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="proactive-alert-card"
          style={{
            marginTop: 12,
            padding: "12px 14px",
            background: SI.surfaceUp,
            border: `1px solid ${SI.hair}`,
            borderLeft: `4px solid ${SI.amberDeep}`,
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.amberDeep,
              letterSpacing: "0.18em",
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Otto · proactive alert
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 14, color: SI.ink, lineHeight: 1.4 }}>
            Driver A reports Maple Street is closed. Reroute via 2nd Ave adds ~15 min.
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              data-testid="btn-accept-reroute"
              onClick={() => dispatch({ type: "DRIVER_B_ACCEPT_REROUTE" })}
              style={{
                flex: 1,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 600,
                background: SI.accentDeep,
                color: "#fff",
                border: "none",
                padding: "7px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Accept reroute
            </button>
            <button
              data-testid="btn-dismiss-reroute"
              onClick={() => dispatch({ type: "SET_B_ALERT_VISIBLE", payload: false })}
              style={{
                flex: 1,
                fontFamily: FONT_BODY,
                fontSize: 12,
                fontWeight: 500,
                background: SI.surface,
                color: SI.inkSoft,
                border: `1px solid ${SI.hair}`,
                padding: "7px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}

      {acceptedReroute && !showProactiveCard && (
        <div
          data-testid="reroute-accepted-mini"
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: SI.accentWash,
            border: `1px solid ${SI.hair}`,
            borderRadius: 10,
          }}
        >
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.accentDeep, letterSpacing: "0.14em", fontWeight: 700 }}>
            ✓ REROUTE APPLIED
          </div>
          <svg viewBox="0 0 200 60" style={{ width: "100%", height: 56, marginTop: 6 }}>
            <line x1="10" y1="40" x2="60" y2="40" stroke={SI.hair} strokeWidth="6" strokeLinecap="round" />
            <line x1="60" y1="40" x2="60" y2="14" stroke={SI.amber} strokeWidth="3" strokeDasharray="4 3" />
            <line x1="60" y1="14" x2="140" y2="14" stroke={SI.amber} strokeWidth="3" strokeDasharray="4 3" />
            <line x1="140" y1="14" x2="140" y2="40" stroke={SI.amber} strokeWidth="3" strokeDasharray="4 3" />
            <line x1="140" y1="40" x2="190" y2="40" stroke={SI.hair} strokeWidth="6" strokeLinecap="round" />
            <circle cx="10" cy="40" r="4" fill={SI.ink} />
            <circle cx="190" cy="40" r="4" fill={SI.accentDeep} />
          </svg>
        </div>
      )}

      {!showProactiveCard && !acceptedReroute && !pendingAlert && (
        <div
          data-testid="awaiting-intelligence"
          style={{
            marginTop: 12,
            padding: "14px 16px",
            border: `1px dashed ${SI.hair}`,
            borderRadius: 10,
            fontFamily: FONT_HEAD,
            fontStyle: "italic",
            fontSize: 12,
            color: SI.inkFaint,
            textAlign: "center",
            letterSpacing: "0.04em",
          }}
        >
          Awaiting intelligence
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: SI.inkFaint,
          letterSpacing: "0.18em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        Report to Dispatch
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: FONT_BODY,
          fontSize: 11,
          color: SI.inkSoft,
          lineHeight: 1.45,
        }}
      >
        Tap to relay an alert to Driver A. The dashboard updates immediately, then StreetIQ asks Driver A by voice if they want to hear the details.
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {(Object.entries(DRIVER_B_SCENARIOS) as [DriverBScenarioId, typeof DRIVER_B_SCENARIOS[DriverBScenarioId]][]).map(([id, sc]) => {
          const tc = toneColor(sc.tone);
          const isActive = pendingAlert?.scenarioId === id;
          return (
            <button
              key={id}
              onClick={() => triggerInboundAlert(id)}
              disabled={!!pendingAlert}
              data-testid={`btn-driver-b-${id}`}
              style={{
                position: "relative",
                textAlign: "left",
                background: SI.surfaceUp,
                border: `1px solid ${isActive ? SI.accent : SI.hair}`,
                borderLeft: `4px solid ${tc.bar}`,
                borderRadius: 10,
                padding: "10px 12px 10px 14px",
                cursor: pendingAlert ? "not-allowed" : "pointer",
                opacity: pendingAlert ? 0.55 : 1,
                transition: "all .2s",
                boxShadow: isActive ? `0 0 0 3px ${SI.accentWash}` : "none",
              }}
            >
              <div style={{ fontFamily: FONT_HEAD, fontSize: 13, color: SI.ink, fontWeight: 500, lineHeight: 1.25 }}>{sc.label}</div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: SI.inkSoft, marginTop: 2, lineHeight: 1.35 }}>{sc.shortHint}</div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 5,
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  color: tc.deep,
                  background: tc.wash,
                  padding: "1px 6px",
                  borderRadius: 3,
                  letterSpacing: "0.12em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                affects Driver A
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
