import React, { createContext, useContext, useReducer, useEffect, useRef } from "react";
import { Mic, MicOff, MapPin, AlertTriangle, CheckCircle, Package, Truck, Clock, Navigation, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

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
  events: [],
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
  isRunningDemo: false,
  pendingFollowUp: null,
};

// --- Driver B → Driver A scenarios (Panel 4 buttons) ---
// Each button is a colleague-reported piece of intelligence that affects
// Driver A's route. Flow: dashboard updates → TTS asks Driver A "want to
// hear it?" → on yes, TTS reads fullMessage and the parcel changes apply.
const DRIVER_B_SCENARIOS: Record<DriverBScenarioId, {
  label: string;
  shortHint: string;
  summary: string;
  fullMessage: string;
  tone: "amber" | "red" | "emerald";
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
    tone: "emerald",
  },
  oak_accident: {
    label: "Accident on Oak St",
    shortHint: "Reroute P001 via Birch St, +15 min",
    summary: "Accident blocking Oak Street",
    fullMessage: "Driver B just witnessed an accident blocking Oak Street near parcel one. I've rerouted you via Birch Street — adds about fifteen minutes.",
    tone: "red",
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
        // Increment nearest spot logic roughly simulated by just picking P-2
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
        // Swap P001 and P002 positions in the parcels array (route order).
        const next = [...state.parcels];
        const i1 = next.findIndex((p) => p.id === "P001");
        const i2 = next.findIndex((p) => p.id === "P002");
        if (i1 >= 0 && i2 >= 0) [next[i1], next[i2]] = [next[i2], next[i1]];
        return { ...state, parcels: next };
      }
      if (sid === "customer_unavailable") {
        // Mark P001 rescheduled to 17:00 and move it to the end of Driver A's route.
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
} | null>(null);

function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}

// --- Main App Component ---
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const clearDemoTimers = () => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
  };

  useEffect(() => () => clearDemoTimers(), []);

  // Proactive announcement when Driver A transitions into "Approaching".
  // Asks for confirmation before opening the map — driver can answer by voice
  // ("yes"/"no") or tap the inline buttons.
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
      dispatch({ type: "ADD_EVENT", payload: `FleetMind → Driver A: approach prompt (awaiting yes/no)` });
      playTtsAlert(question);
    }
    prevDriverAStateRef.current = state.driverAState;
  }, [state.driverAState]);

  const playTtsAlert = async (text: string) => {
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
        audio.play();
        return;
      }
    } catch {
      // fall through to browser fallback
    }
    // Browser speechSynthesis fallback
    if ("speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1;
      window.speechSynthesis.speak(utt);
    }
  };

  const resolveDelayParcel = (ref: string | undefined): Parcel | null => {
    // Driver A's full route (all statuses) — used for ordinal matching so
    // "delivery 3" always means the 3rd stop on the route, even if earlier
    // ones are already delivered or in transit.
    const aRoute = stateRef.current.parcels.filter((p) => p.driver === "Driver A");
    const aOpen = aRoute.filter((p) => p.status === "pending" || p.status === "delayed");
    if (aRoute.length === 0) return null;
    const isAtStop = stateRef.current.driverAState === "Parked" || stateRef.current.driverAState === "Approaching";
    const cleaned = (ref ?? "").toLowerCase().trim();

    // Empty / "next" / "the next one" → next upcoming parcel (open ones only)
    if (!cleaned || /\b(next|upcoming|following)\b/.test(cleaned)) {
      if (aOpen.length === 0) return null;
      return isAtStop ? (aOpen[1] ?? aOpen[0]) : aOpen[0];
    }
    // Exact parcel id (P001, P002, ...)
    const idMatch = cleaned.match(/p\s*0*([1-9]\d*)/);
    if (idMatch) {
      const id = `P${idMatch[1].padStart(3, "0")}`;
      const byId = aRoute.find((p) => p.id === id);
      if (byId) return byId;
    }
    // Ordinal: "delivery 3", "stop number 2", "the third", "second"
    const ordinalWords: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
    let n: number | null = null;
    const numMatch = cleaned.match(/\b(\d+)\b/);
    if (numMatch) n = parseInt(numMatch[1], 10);
    else {
      for (const [w, v] of Object.entries(ordinalWords)) {
        if (cleaned.includes(w)) { n = v; break; }
      }
    }
    if (n !== null && n >= 1) {
      // Try parcel-id-by-number first (P00N) — most reliable across statuses.
      const byNumberId = aRoute.find((p) => p.id === `P${String(n).padStart(3, "0")}`);
      if (byNumberId) return byNumberId;
      // Otherwise treat n as the Nth stop on the full route.
      if (n <= aRoute.length) return aRoute[n - 1];
    }

    // Street name match (e.g., "maple")
    const byStreet = aRoute.find((p) => cleaned && p.address.toLowerCase().includes(cleaned));
    if (byStreet) return byStreet;
    const byStreetWord = aRoute.find((p) => {
      const words = cleaned.split(/\s+/);
      return words.some((w) => w.length > 2 && p.address.toLowerCase().includes(w));
    });
    if (byStreetWord) return byStreetWord;

    // Fallback: next upcoming parcel
    if (aOpen.length === 0) return null;
    return isAtStop ? (aOpen[1] ?? aOpen[0]) : aOpen[0];
  };

  const processIntent = (intent: string, entity: string, extras: DelayExtras = {}) => {
    console.log("[FLEETMIND] processIntent", { intent, entity, extras });
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
      console.log("[FLEETMIND] delay_reported resolved", { parcelRef: extras.parcelRef, resolvedTo: target?.id ?? null, target });
      if (target) {
        const label = `${target.id} — ${target.address} (${target.customer})`;
        if (typeof extras.minutes === "number" && extras.reason) {
          // Driver already told us BOTH duration and reason — apply immediately, no follow-up.
          dispatch({ type: "APPLY_DELAY", payload: { parcelId: target.id, minutes: extras.minutes, reason: extras.reason } });
          dispatch({ type: "SET_INTENT", payload: { intent: "delay_reported", entity: `${target.id} +${extras.minutes}min · ${extras.reason}` } });
          dispatch({ type: "ADD_EVENT", payload: `Driver A: ${target.id} delayed +${extras.minutes}min — ${extras.reason}` });
          playTtsAlert(`Got it. ${target.id} on ${target.address} pushed back ${extras.minutes} minutes due to ${extras.reason}.`);
        } else {
          // Need follow-up for whatever's missing.
          const missing: string[] = [];
          if (typeof extras.minutes !== "number") missing.push("how long");
          if (!extras.reason) missing.push("what happened");
          const question = missing.length === 2
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

  // Trigger an inbound alert from Driver B → Driver A.
  // Step 1: dashboard logs the colleague-reported event.
  // Step 2: open a confirm-style follow-up on Panel 1 ("Want to hear it?").
  // Step 3 happens on Yes (acceptInboundAlert) — TTS reads the full message
  //   and APPLY_INBOUND_SCENARIO mutates parcels accordingly.
  const triggerInboundAlert = (scenarioId: DriverBScenarioId) => {
    const sc = DRIVER_B_SCENARIOS[scenarioId];
    console.log("[FLEETMIND] triggerInboundAlert", { scenarioId, summary: sc.summary });
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: ${sc.summary}` });
    dispatch({ type: "ADD_EVENT", payload: `FleetMind → Driver A: relaying alert (awaiting yes/no)` });
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
      }, 8000)
    );
  };

  return (
    <DemoContext.Provider value={{ state, dispatch, processIntent, triggerInboundAlert }}>
      <div className="min-h-screen w-full bg-slate-100 flex flex-col font-sans overflow-hidden text-slate-900">
        
        {/* Simulation Controls */}
        <div className="h-10 bg-slate-900 text-slate-200 flex items-center px-4 shrink-0 shadow-sm z-50 text-sm font-medium">
          <div className="flex items-center gap-2 mr-8">
            <span className="text-slate-400">Driver A:</span>
            <div className="flex gap-1">
              {(["Driving", "Approaching", "Parked"] as DriverState[]).map(s => (
                <button
                  key={s}
                  data-testid={`btn-sim-a-${s}`}
                  onClick={() => dispatch({ type: "SET_DRIVER_A_STATE", payload: s })}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${state.driverAState === s ? "bg-blue-600 text-white" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {state.isRunningDemo && <span className="text-amber-400 animate-pulse text-xs font-mono">Demo running...</span>}
            <button 
              data-testid="btn-sim-reset"
              onClick={() => { clearDemoTimers(); dispatch({ type: "RESET_DEMO" }); }}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs transition-colors"
            >
              Reset Demo
            </button>
            <button 
              data-testid="btn-sim-run"
              onClick={handleRunDemo}
              disabled={state.isRunningDemo}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▶ Run Demo
            </button>
          </div>
        </div>

        {/* 2x2 Grid */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-slate-300">
          {/* Panel 1 */}
          <div className="bg-white relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 bg-slate-100 text-slate-500 text-xs font-mono px-3 py-1 font-semibold uppercase tracking-widest border-b border-r border-slate-200 z-10 rounded-br-lg">
              Panel 1 — Voice Cockpit
            </div>
            <PanelOne />
          </div>

          {/* Panel 2 */}
          <div className="bg-slate-50 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 bg-slate-200 text-slate-500 text-xs font-mono px-3 py-1 font-semibold uppercase tracking-widest border-b border-r border-slate-300 z-10 rounded-br-lg">
              Panel 2 — Adaptive Map
            </div>
            <PanelTwo />
          </div>

          {/* Panel 3 */}
          <div className="bg-white relative overflow-hidden flex flex-col border-t border-slate-200">
            <div className="absolute top-0 left-0 bg-slate-100 text-slate-500 text-xs font-mono px-3 py-1 font-semibold uppercase tracking-widest border-b border-r border-slate-200 z-10 rounded-br-lg">
              Panel 3 — Dispatch Dashboard
            </div>
            <PanelThree />
          </div>

          {/* Panel 4 */}
          <div className="bg-slate-50 relative overflow-hidden flex flex-col border-t border-slate-200">
            <div className="absolute top-0 left-0 bg-slate-200 text-slate-500 text-xs font-mono px-3 py-1 font-semibold uppercase tracking-widest border-b border-r border-slate-300 z-10 rounded-br-lg">
              Panel 4 — Proactive Copilot
            </div>
            <PanelFour />
          </div>
        </div>

      </div>
    </DemoContext.Provider>
  );
}

// --- Panel 1: Voice Cockpit ---
function PanelOne() {
  const { state, dispatch, processIntent } = useDemo();

  const playInboundTts = async (text: string) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova" }),
      });
      if (res.ok) {
        const blob = await res.blob();
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
        return;
      }
    } catch { /* fall through */ }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  };

  const acceptInboundAlert = (alert: { scenarioId: DriverBScenarioId; summary: string; fullMessage: string }) => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: alert.scenarioId } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: accepted alert "${alert.summary}"` });
    dispatch({ type: "APPLY_INBOUND_SCENARIO", payload: { scenarioId: alert.scenarioId } });
    dispatch({ type: "ADD_EVENT", payload: `FleetMind → Driver A: ${alert.fullMessage}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    playInboundTts(alert.fullMessage);
  };

  const declineInboundAlert = (alert: { summary: string }) => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_no", entity: "" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: dismissed alert "${alert.summary}"` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
  };

  const followUpRef = useRef(state.pendingFollowUp);
  useEffect(() => { followUpRef.current = state.pendingFollowUp; }, [state.pendingFollowUp]);

  const handleMicClick = async () => {
    if (state.isListening) return;

    dispatch({ type: "SET_LISTENING", payload: true });

    try {
      const SpeechRecognitionCtor = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
        ?? (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
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
        // Fallback for browsers without speech API in this demo context
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
    } catch (e) {
      dispatch({ type: "SET_LISTENING", payload: false });
    }
  };

  // Route transcript to the right handler depending on whether a follow-up is pending.
  // If the user starts a NEW delay/intent while a follow-up is still open, treat
  // it as a fresh classification rather than forcing it into the open follow-up.
  const looksLikeFreshIntent = (text: string) => {
    const t = text.toLowerCase();
    return /\b(delay|late|behind|delivery|parcel|stop|road|closed|blocked|parking|park|customer|not home|delivered|map|navigate|naviga)\b/.test(t)
      && /\b(next|another|again|also|more|delivery\s*\d|parcel\s*\d|stop\s*\d|p0*\d+)\b/.test(t);
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
    else acceptInboundAlert(alert); // ambiguous → default to playing it (fail-open for the demo)
  };

  const routeTranscript = async (text: string) => {
    const pending = followUpRef.current;
    console.log("[FLEETMIND] transcript →", { text, pending: pending?.type ?? null });
    if (pending && pending.type === "delay_details" && !looksLikeFreshIntent(text)) {
      await handleDelayDetails(text, pending);
    } else if (pending && pending.type === "confirm_navigation" && !looksLikeFreshIntent(text)) {
      handleNavigationAnswer(text);
    } else if (pending && pending.type === "inbound_alert" && !looksLikeFreshIntent(text)) {
      handleInboundAnswer(text, pending);
    } else {
      // Either no pending, or the user clearly started a new request — clear and classify fresh.
      if (pending) dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
      await classifyTranscript(text);
    }
  };

  const speakConfirmation = async (text: string) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "nova" }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play().catch(() => {});
        return;
      }
    } catch {
      // fall through
    }
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    }
  };

  const acceptNavigation = () => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: "" } });
    dispatch({ type: "SET_MAP_OPENING", payload: true });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: confirmed → opening navigation…` });
    speakConfirmation("Opening the map and pulling up parking hotspots near you.");
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
    dispatch({
      type: "ADD_EVENT",
      payload: `Driver A: ${pending.parcelId} delayed +${minutes}min — ${reason}`,
    });
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
        body: JSON.stringify({ transcript: text })
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[FLEETMIND] classify ←", { transcript: text, ...data });
        const extras: DelayExtras = {};
        if (typeof data.parcelRef === "string") extras.parcelRef = data.parcelRef;
        if (typeof data.minutes === "number") extras.minutes = data.minutes;
        if (typeof data.reason === "string" && data.reason.length > 0) extras.reason = data.reason;
        processIntent(data.intent, data.entity, extras);
        return;
      }
    } catch (e) {
      console.warn("[FLEETMIND] classify failed, using keyword fallback", { transcript: text, error: e });
    }

    // Keyword fallback
    const lower = text.toLowerCase();
    if (lower.includes("closed") || lower.includes("blocked")) processIntent("road_closed", "Maple Street");
    else if (lower.includes("delay") || lower.includes("late") || lower.includes("behind")) {
      // Best-effort offline extraction
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
    }
    else if (lower.includes("parking") || lower.includes("park")) processIntent("parking_issue", "");
    else if (lower.includes("not home") || lower.includes("nobody")) processIntent("customer_not_home", "");
    else if (lower.includes("delivered") || lower.includes("done")) processIntent("delivery_complete", "");
    else if (lower.includes("map") || lower.includes("navigate")) processIntent("request_map", "");
    else processIntent("general", "");
  };

  const aParcel = state.parcels.find(p => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed"));
  
  return (
    <div className="flex-1 flex flex-col p-6 pt-12 items-center justify-center relative">
      
      {/* State Badge */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
        <div className={`w-2 h-2 rounded-full ${state.driverAState === 'Driving' ? 'bg-blue-500' : state.driverAState === 'Approaching' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="text-sm font-medium text-slate-700">{state.driverAState}</span>
      </div>

      {/* Current Parcel Card */}
      {aParcel && (
        <div className="mb-8 w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
              <Package size={14} /> {aParcel.id}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-slate-900 leading-none">{aParcel.eta}</div>
              <div className="text-xs text-slate-500 font-mono">ETA</div>
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">{aParcel.address}</div>
            <div className="text-sm text-slate-600">{aParcel.customer}</div>
          </div>
        </div>
      )}

      {/* Pending Follow-Up Prompt */}
      {state.pendingFollowUp && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 w-full max-w-sm bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4"
          data-testid="followup-prompt"
        >
          <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle size={12} /> FleetMind asks
          </div>
          <div className="text-slate-900 font-medium">{state.pendingFollowUp.question}</div>
          <div className="text-xs text-slate-600 mt-2 font-mono">
            Re: {state.pendingFollowUp.type === "delay_details"
              ? state.pendingFollowUp.parcelLabel
              : state.pendingFollowUp.type === "confirm_navigation"
                ? state.pendingFollowUp.contextLabel
                : `Driver B → ${state.pendingFollowUp.summary}`}
          </div>

          {state.pendingFollowUp.type === "inbound_alert" ? (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  const alert = state.pendingFollowUp as Extract<PendingFollowUp, { type: "inbound_alert" }>;
                  acceptInboundAlert(alert);
                }}
                className="flex-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                data-testid="btn-inbound-yes"
              >
                Yes, read it
              </button>
              <button
                onClick={() => {
                  const alert = state.pendingFollowUp as Extract<PendingFollowUp, { type: "inbound_alert" }>;
                  declineInboundAlert(alert);
                }}
                className="flex-1 px-3 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium border border-slate-300"
                data-testid="btn-inbound-no"
              >
                Dismiss
              </button>
            </div>
          ) : state.pendingFollowUp.type === "confirm_navigation" ? (
            state.mapOpening ? (
              <div className="mt-3 flex items-center gap-2 text-emerald-700 text-sm font-medium" data-testid="map-opening">
                <Loader2 size={14} className="animate-spin" />
                Opening map and parking hotspots…
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={acceptNavigation}
                  className="flex-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                  data-testid="btn-followup-yes"
                >
                  Yes, open map
                </button>
                <button
                  onClick={declineNavigation}
                  className="flex-1 px-3 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium border border-slate-300"
                  data-testid="btn-followup-no"
                >
                  No thanks
                </button>
              </div>
            )
          ) : (
            <button
              onClick={() => dispatch({ type: "CLEAR_PENDING_FOLLOWUP" })}
              className="mt-2 text-xs text-amber-700 hover:text-amber-900 underline"
              data-testid="btn-cancel-followup"
            >
              cancel
            </button>
          )}
        </motion.div>
      )}

      {/* Mic Button */}
      <div className="relative mb-12">
        {state.isListening && (
          <motion.div
            className="absolute inset-0 bg-blue-500/20 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
        <button
          data-testid="btn-mic"
          onClick={handleMicClick}
          className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all
            ${state.isListening
              ? 'bg-blue-600 text-white scale-95 shadow-inner'
              : state.pendingFollowUp
                ? 'bg-white text-amber-600 hover:bg-amber-50 border-2 border-amber-200'
                : 'bg-white text-blue-600 hover:bg-blue-50 border-2 border-blue-100'}`}
        >
          <Mic size={36} strokeWidth={2.5} />
        </button>
      </div>

      {/* Transcript Area */}
      <div className="w-full max-w-sm h-32 flex flex-col items-center justify-start text-center">
        {state.isListening ? (
          <div className="text-slate-500 font-medium flex items-center gap-2 animate-pulse">
            Listening...
          </div>
        ) : state.transcript ? (
          <>
            <p className="text-lg text-slate-800 font-medium italic">"{state.transcript}"</p>
            {state.lastIntent && (
              <div className="mt-4 inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded border border-slate-200 font-mono text-xs text-slate-600">
                <span className="font-bold text-blue-600">{state.lastIntent}</span>
                {state.lastEntity && <span className="bg-slate-200 px-1.5 rounded">{state.lastEntity}</span>}
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-400 text-sm">Tap mic to speak to FleetMind...</p>
        )}
      </div>

    </div>
  );
}

// --- Panel 2: Adaptive Map ---
function PanelTwo() {
  const { state, dispatch } = useDemo();

  return (
    <div className="flex-1 relative overflow-hidden bg-[#eef2f6]">
      <AnimatePresence>
        {state.mapVisible && (
          <motion.div 
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute inset-0 p-8 pt-12 flex flex-col items-center justify-center"
          >
            <div className="w-full h-full max-w-lg bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden relative">
              <svg viewBox="0 0 480 280" className="w-full h-full text-slate-300">
                {/* Base Streets */}
                <line x1="30" y1="50" x2="430" y2="50" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                <line x1="30" y1="130" x2="430" y2="130" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                <line x1="30" y1="220" x2="430" y2="220" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                <line x1="120" y1="20" x2="120" y2="280" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                <line x1="300" y1="20" x2="300" y2="280" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />

                {/* Default Route */}
                {!state.roadClosed && (
                  <polyline 
                    points="30,50 120,50 120,130 300,130 300,220 430,220" 
                    fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinejoin="round" 
                  />
                )}

                {/* Alternate Route (Road Closed) */}
                {state.roadClosed && (
                  <>
                    <line x1="220" y1="120" x2="240" y2="140" stroke="#ef4444" strokeWidth="4" />
                    <line x1="240" y1="120" x2="220" y2="140" stroke="#ef4444" strokeWidth="4" />
                    <polyline 
                      points="30,50 120,50 120,20 300,20 300,130 430,130" 
                      fill="none" stroke="#f97316" strokeWidth="4" strokeDasharray="6 4" strokeLinejoin="round"
                    />
                  </>
                )}

                {/* Heatmap Spots */}
                {state.heatmapSpots.map(s => {
                  let fill = "#9ca3af";
                  if (s.confirmations > 0 && s.confirmations <= 3) fill = "#86efac";
                  else if (s.confirmations > 3 && s.confirmations <= 7) fill = "#22c55e";
                  else if (s.confirmations > 7) fill = "#15803d";
                  return (
                    <circle key={s.id} cx={s.x} cy={s.y} r="12" fill={fill} opacity="0.85">
                      <title>{s.label} ({s.confirmations} confirms)</title>
                    </circle>
                  )
                })}
                
                {/* Truck marker */}
                <circle cx={state.roadClosed ? 120 : 120} cy={state.roadClosed ? 50 : 130} r="6" fill="#1e293b" />
              </svg>
              
              {state.roadClosed && !state.driverARerouteOverlayDismissed && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-3 rounded-lg shadow-lg border border-orange-200 flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-sm">Reroute Active</span>
                    <span className="text-xs text-slate-500">+15 min delay</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => dispatch({ type: "DISMISS_A_REROUTE_OVERLAY" })}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => {
                        dispatch({ type: "SET_MAP_VISIBLE", payload: true });
                        dispatch({ type: "DISMISS_A_REROUTE_OVERLAY" });
                      }}
                    >
                      Accept Route
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!state.mapVisible && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-mono text-sm">
          Map idle
        </div>
      )}
    </div>
  );
}

// --- Panel 3: Dispatch Dashboard ---
function PanelThree() {
  const { state } = useDemo();

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'pending': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'in_transit': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'delivered': return 'bg-green-50 text-green-700 border-green-200';
      case 'rescheduled': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'delayed': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'failed': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden pt-10">
      
      {/* Table */}
      <div className="flex-1 flex flex-col border-r border-slate-200">
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 font-mono">
              <tr>
                <th className="px-4 py-3 font-medium">Parcel</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium text-right">ETA</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.parcels.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-600">{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.address}</div>
                    <div className="text-xs text-slate-500">{p.customer}</div>
                    {(p.delayReasons ?? []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1" data-testid={`delay-reasons-${p.id}`}>
                        {(p.delayReasons ?? []).map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-medium"
                          >
                            <AlertTriangle size={9} />
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Truck size={14} className="text-slate-400" />
                      {p.driver}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                    {p.eta !== p.originalEta ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-orange-600">{p.eta}</span>
                        <span className="text-[10px] text-slate-400 line-through font-normal" data-testid={`original-eta-${p.id}`}>
                          was {p.originalEta}
                        </span>
                      </div>
                    ) : (
                      <span>{p.eta}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${getStatusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Log */}
      <div className="w-[30%] bg-slate-900 text-slate-300 flex flex-col font-mono text-xs">
        <div className="p-3 border-b border-slate-800 text-slate-400 font-semibold tracking-widest uppercase flex items-center justify-between">
          <span>System Log</span>
          <div className="flex gap-1 items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px]">LIVE</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <AnimatePresence initial={false}>
            {state.events.map((e) => (
              <motion.div 
                key={e.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="leading-relaxed"
              >
                <span className="text-slate-500 mr-2">[{e.timestamp}]</span>
                <span className={`${e.message.includes('ALERT') ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                  {e.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {state.events.length === 0 && (
            <div className="text-slate-600 italic">Waiting for events...</div>
          )}
        </div>
      </div>

    </div>
  );
}

// --- Panel 4: Driver B → Driver A Scenario Triggers ---
// Each button reports a piece of intelligence from Driver B that affects
// Driver A's route. Pressing one logs to the dashboard, then opens a
// "want to hear it?" prompt on Panel 1 with TTS + voice yes/no.
function PanelFour() {
  const { state, triggerInboundAlert } = useDemo();
  const bParcel = state.parcels.find((p) => p.driver === "Driver B" && p.status === "pending");
  const pendingAlert = state.pendingFollowUp?.type === "inbound_alert" ? state.pendingFollowUp : null;

  const toneClasses: Record<"amber" | "red" | "emerald", { bar: string; icon: string; chip: string }> = {
    amber: { bar: "bg-amber-500", icon: "text-amber-600", chip: "bg-amber-50 text-amber-700 border-amber-200" },
    red: { bar: "bg-red-500", icon: "text-red-600", chip: "bg-red-50 text-red-700 border-red-200" },
    emerald: { bar: "bg-emerald-500", icon: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };

  return (
    <div className="flex-1 flex flex-col p-6 pt-12 relative overflow-auto">
      {/* State Badge */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-200 px-3 py-1.5 rounded-full border border-slate-300">
        <div className={`w-2 h-2 rounded-full ${state.driverBState === 'Driving' ? 'bg-blue-500' : state.driverBState === 'Approaching' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="text-sm font-medium text-slate-700">{state.driverBState}</span>
      </div>

      <div className="w-full max-w-md mx-auto flex flex-col gap-4">
        {/* Driver B's current parcel */}
        {bParcel && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex items-center gap-3">
            <Truck size={18} className="text-slate-400" />
            <div className="flex-1">
              <div className="text-xs font-mono text-slate-500">{bParcel.id} · ETA {bParcel.eta}</div>
              <div className="text-sm font-semibold text-slate-900">{bParcel.address}</div>
              <div className="text-xs text-slate-500">{bParcel.customer}</div>
            </div>
          </div>
        )}

        {/* Pending alert indicator */}
        {pendingAlert && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Sent to Driver A — awaiting yes/no on Panel 1
          </div>
        )}

        <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mt-2">
          Report to Dispatch
        </div>
        <div className="text-xs text-slate-500 -mt-2 leading-snug">
          Tap to relay an alert to Driver A. The dashboard updates immediately, then FleetMind asks Driver A by voice if they want to hear the details.
        </div>

        {/* Scenario buttons */}
        <div className="flex flex-col gap-2">
          {(Object.entries(DRIVER_B_SCENARIOS) as [DriverBScenarioId, typeof DRIVER_B_SCENARIOS[DriverBScenarioId]][]).map(([id, sc]) => {
            const tc = toneClasses[sc.tone];
            const isActive = pendingAlert?.scenarioId === id;
            return (
              <button
                key={id}
                onClick={() => triggerInboundAlert(id)}
                disabled={!!pendingAlert}
                data-testid={`btn-driver-b-${id}`}
                className={`relative text-left bg-white border rounded-xl p-3 pl-4 shadow-sm transition-all overflow-hidden
                  ${pendingAlert ? "opacity-60 cursor-not-allowed" : "hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"}
                  ${isActive ? "ring-2 ring-blue-400" : "border-slate-200"}`}
              >
                <div className={`absolute top-0 left-0 w-1 h-full ${tc.bar}`} />
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${tc.icon}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 leading-tight">{sc.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-snug">{sc.shortHint}</div>
                    <div className={`inline-block mt-1.5 px-1.5 py-0.5 rounded border text-[10px] font-mono ${tc.chip}`}>
                      affects Driver A
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
