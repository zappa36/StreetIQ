import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from "react";
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
type ParcelStatus = "pending" | "in_transit" | "delivered" | "rescheduled" | "delayed" | "early" | "failed";

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
  | { type: "delay_details"; parcelId: string; parcelLabel: string; question: string; knownMinutes: number | null; knownReason: string | null; reasonAsked?: boolean; minutesAsked?: boolean }
  | { type: "ahead_details"; parcelId: string; parcelLabel: string; question: string; knownMinutes: number | null; knownReason: string | null; reasonAsked?: boolean; minutesAsked?: boolean }
  | { type: "confirm_navigation"; question: string; contextLabel: string }
  | { type: "inbound_alert"; scenarioId: DriverBScenarioId | null; summary: string; fullMessage: string; question: string };

interface DelayExtras {
  parcelRef?: string;
  minutes?: number;
  reason?: string;
}

interface BackOfficeRec {
  id: string;
  reason: string;
  parcelIdsToMove: string[];
  summary: string;
  narration: string;
  createdAt: string;
  totalDelayMin: number;
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
  spokenCaption: string;
  isRunningDemo: boolean;
  scenarioIdx: number;
  awaitingScenarioStart: boolean;
  currentParcelId: string | null;
  continuousMode: boolean;
  resetSignal: number;
  ttsInFlight: number;
  pendingFollowUp: PendingFollowUp | null;
  backOfficeRecommendation: BackOfficeRec | null;
  backOfficeNotification: boolean;
  backOfficeIsSpeaking: boolean;
  backOfficeIsListening: boolean;
  backOfficeCardOpen: boolean;
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
  | { type: "COMPLETE_PARCEL"; payload: { parcelId: string } }
  | { type: "DRIVER_B_ACCEPT_REROUTE" }
  | { type: "SET_B_ALERT_VISIBLE"; payload: boolean }
  | { type: "SET_B_REROUTE_ACCEPTED"; payload: boolean }
  | { type: "INCREMENT_PARKING"; payload: string }
  | { type: "SET_TRANSCRIPT"; payload: string }
  | { type: "SET_INTENT"; payload: { intent: string; entity: string } }
  | { type: "SET_LISTENING"; payload: boolean }
  | { type: "SET_SPEAKING"; payload: boolean }
  | { type: "TTS_IN_FLIGHT_DELTA"; payload: number }
  | { type: "SET_SPOKEN_CAPTION"; payload: string }
  | { type: "SET_RUNNING_DEMO"; payload: boolean }
  | { type: "SET_SCENARIO_GATE"; payload: { idx: number; awaiting: boolean } }
  | { type: "SET_CURRENT_PARCEL"; payload: { parcelId: string } }
  | { type: "SET_CONTINUOUS_MODE"; payload: boolean }
  | { type: "UPDATE_PARCELS"; payload: Parcel[] }
  | { type: "SET_PENDING_FOLLOWUP"; payload: PendingFollowUp }
  | { type: "CLEAR_PENDING_FOLLOWUP" }
  | { type: "APPLY_DELAY"; payload: { parcelId: string; minutes: number; reason: string } }
  | { type: "APPLY_AHEAD"; payload: { parcelId: string; minutes: number; reason: string } }
  | { type: "APPLY_INBOUND_SCENARIO"; payload: { scenarioId: DriverBScenarioId } }
  | { type: "RAISE_BACK_OFFICE_REC"; payload: BackOfficeRec }
  | { type: "CLEAR_BACK_OFFICE_REC" }
  | { type: "APPLY_BACK_OFFICE_REC" }
  | { type: "OPEN_BACK_OFFICE_CARD" }
  | { type: "CLOSE_BACK_OFFICE_CARD" }
  | { type: "SET_BACK_OFFICE_VOICE_STATE"; payload: { speaking?: boolean; listening?: boolean } }
  | { type: "RESET_DEMO" };

// --- Mock Data ---
const INITIAL_PARCELS: Parcel[] = [
  { id: "P001", address: "12 Oak St", customer: "Alice Chen", driver: "Driver A", eta: "14:20", originalEta: "14:20", status: "pending", delayReasons: [] },
  { id: "P002", address: "34 Maple Ave", customer: "Bob Torres", driver: "Driver A", eta: "14:35", originalEta: "14:35", status: "pending", delayReasons: [] },
  { id: "P003", address: "56 Pine Rd", customer: "Carol Wu", driver: "Driver A", eta: "14:50", originalEta: "14:50", status: "pending", delayReasons: [] },
  { id: "P004", address: "78 Maple St", customer: "David Kim", driver: "Driver A", eta: "15:05", originalEta: "15:05", status: "pending", delayReasons: [] },
  { id: "P005", address: "91 Elm Blvd", customer: "Emma Park", driver: "Driver A", eta: "15:20", originalEta: "15:20", status: "pending", delayReasons: [] },
  { id: "P006", address: "103 Cedar Ln", customer: "Frank Li", driver: "Driver A", eta: "15:35", originalEta: "15:35", status: "pending", delayReasons: [] },
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
  events: [{ id: "e-init", timestamp: "14:18:02", message: "Route 04 dispatched · 6 stops · Driver A" }],
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
  spokenCaption: "",
  isRunningDemo: false,
  scenarioIdx: -1,
  awaitingScenarioStart: false,
  currentParcelId: "P001",
  continuousMode: false,
  resetSignal: 0,
  ttsInFlight: 0,
  pendingFollowUp: null,
  backOfficeRecommendation: null,
  backOfficeNotification: false,
  backOfficeIsSpeaking: false,
  backOfficeIsListening: false,
  backOfficeCardOpen: false,
};

const SCENARIOS: { id: string; title: string; description: string }[] = [
  {
    id: "navigation",
    title: "Scenario 1 — Proactive Navigation",
    description:
      "Driver A is approaching their first stop. StreetIQ proactively offers to open the map and surface parking hotspots nearby.",
  },
  {
    id: "delay",
    title: "Scenario 2 — Voice-Reported Delay",
    description:
      "Driver A tells Otto there's heavy traffic and they'll be ten minutes late to the next delivery. StreetIQ updates the ETA and notifies dispatch.",
  },
  {
    id: "reroute",
    title: "Scenario 3 — Crowdsourced Road Closure",
    description:
      "Driver B reports Maple Avenue is closed. StreetIQ relays the closure to Driver A and offers an alternate route that affects their stops.",
  },
  {
    id: "back_office",
    title: "Scenario 4 — Back Office Rebalance",
    description:
      "Driver A piles up delays. Back Office Otto detects Driver A is falling behind, recommends rescheduling the last two stops to tomorrow, and rebalances after dispatch accepts.",
  },
];

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
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Re-stamp ETAs for the OPEN portion of Driver A's route after a re-sequence.
// Anchors at the earliest current ETA among open (non-delivered, non-rescheduled)
// Driver A stops, then spaces them 15 minutes apart in their new order. Stops
// with status "rescheduled" or "delivered" keep their existing ETA.
function restampDriverARoute(
  parcels: Parcel[],
  opts: { tagP001?: string; tagP002?: string; generalTag?: string; intervalMin?: number } = {}
): Parcel[] {
  const interval = opts.intervalMin ?? 15;
  const aRoute = parcels.filter((p) => p.driver === "Driver A");
  const open = aRoute.filter((p) => p.status !== "delivered" && p.status !== "rescheduled");
  if (open.length === 0) return parcels;
  const anchor = Math.min(...open.map((p) => timeToMin(p.eta)));
  const newEtaById = new Map<string, string>();
  open.forEach((p, i) => {
    const total = anchor + i * interval;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    newEtaById.set(p.id, `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  });
  return parcels.map((p) => {
    const newEta = newEtaById.get(p.id);
    if (!newEta || newEta === p.eta) return p;
    let tag = opts.generalTag ?? `re-sequenced · ETA → ${newEta}`;
    if (p.id === "P001" && opts.tagP001) tag = opts.tagP001;
    if (p.id === "P002" && opts.tagP002) tag = opts.tagP002;
    return { ...p, eta: newEta, delayReasons: [...(p.delayReasons ?? []), tag] };
  });
}

// Re-stamp ETAs for Driver B's open route. Anchor at the earliest current
// ETA among Driver B open stops; space them 15 min apart in route order.
function restampDriverBRoute(parcels: Parcel[], anchorEta?: string): Parcel[] {
  const interval = 15;
  const bRoute = parcels.filter((p) => p.driver === "Driver B");
  const open = bRoute.filter((p) => p.status !== "delivered" && p.status !== "rescheduled");
  if (open.length === 0) return parcels;
  const baseAnchor = anchorEta
    ? timeToMin(anchorEta)
    : Math.min(...open.map((p) => timeToMin(p.eta)));
  const newEtaById = new Map<string, string>();
  open.forEach((p, i) => {
    const total = baseAnchor + i * interval;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    newEtaById.set(p.id, `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  });
  return parcels.map((p) => {
    const newEta = newEtaById.get(p.id);
    if (!newEta || newEta === p.eta) return p;
    return {
      ...p,
      eta: newEta,
      delayReasons: [...(p.delayReasons ?? []), `re-stamped · ETA → ${newEta}`],
    };
  });
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
    case "COMPLETE_PARCEL": {
      const updatedParcels = state.parcels.map((p) =>
        p.id === action.payload.parcelId ? { ...p, status: "delivered" as ParcelStatus } : p
      );
      // If we just completed the current parcel, advance to next open Driver A stop.
      let nextCurrent = state.currentParcelId;
      if (state.currentParcelId === action.payload.parcelId) {
        const nextOpen = updatedParcels.find(
          (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early")
        );
        nextCurrent = nextOpen ? nextOpen.id : null;
      }
      return { ...state, parcels: updatedParcels, currentParcelId: nextCurrent };
    }
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
      return { ...state, isListening: action.payload, ...(action.payload ? { spokenCaption: "" } : {}) };
    case "SET_SPEAKING":
      return { ...state, isSpeaking: action.payload };
    case "SET_SPOKEN_CAPTION":
      return { ...state, spokenCaption: action.payload };
    case "SET_RUNNING_DEMO":
      return { ...state, isRunningDemo: action.payload };
    case "SET_SCENARIO_GATE":
      return { ...state, scenarioIdx: action.payload.idx, awaitingScenarioStart: action.payload.awaiting };
    case "SET_CONTINUOUS_MODE":
      return { ...state, continuousMode: action.payload };
    case "SET_CURRENT_PARCEL": {
      const target = state.parcels.find((p) => p.id === action.payload.parcelId);
      if (!target) return state;
      const sameDriverIds = state.parcels.filter((p) => p.driver === target.driver).map((p) => p.id);
      const targetIdx = sameDriverIds.indexOf(target.id);
      const beforeIds = new Set(sameDriverIds.slice(0, targetIdx));
      const afterIds = new Set(sameDriverIds.slice(targetIdx + 1));
      return {
        ...state,
        currentParcelId: target.id,
        parcels: state.parcels.map((p) => {
          if (p.id === target.id) return { ...p, status: "pending" as ParcelStatus };
          if (beforeIds.has(p.id)) return { ...p, status: "delivered" as ParcelStatus };
          if (afterIds.has(p.id)) return { ...p, status: "pending" as ParcelStatus };
          return p;
        }),
      };
    }
    case "UPDATE_PARCELS":
      return { ...state, parcels: action.payload };
    case "SET_PENDING_FOLLOWUP":
      return { ...state, pendingFollowUp: action.payload };
    case "CLEAR_PENDING_FOLLOWUP":
      return { ...state, pendingFollowUp: null };
    case "APPLY_INBOUND_SCENARIO": {
      const sid = action.payload.scenarioId;
      if (sid === "maple_closed") {
        const aOrder = state.parcels.filter((p) => p.driver === "Driver A").map((p) => p.id);
        const targetIdx = aOrder.indexOf("P002");
        const cascadeIds = new Set(targetIdx >= 0 ? aOrder.slice(targetIdx) : []);
        return {
          ...state,
          parcels: state.parcels.map((p) => {
            if (!cascadeIds.has(p.id)) return p;
            if (p.status === "delivered") return p;
            if (p.id === "P002") {
              return {
                ...p,
                status: "delayed" as ParcelStatus,
                eta: addMinutes(p.eta, 10),
                delayReasons: [...(p.delayReasons ?? []), "+10min · Maple Ave closed"],
              };
            }
            return {
              ...p,
              eta: addMinutes(p.eta, 10),
              delayReasons: [...(p.delayReasons ?? []), "+10min · cascading from P002"],
            };
          }),
        };
      }
      if (sid === "oak_traffic") {
        // Re-sequence: head to P002 first, then come back to P001. Re-stamp
        // ETAs for the whole open Driver A route so each delivery reflects
        // the new visit order.
        const next = [...state.parcels];
        const i1 = next.findIndex((p) => p.id === "P001");
        const i2 = next.findIndex((p) => p.id === "P002");
        if (i1 >= 0 && i2 >= 0) [next[i1], next[i2]] = [next[i2], next[i1]];
        const restamped = restampDriverARoute(next, {
          tagP002: "re-sequenced · head here first",
          tagP001: "re-sequenced · visit after P002 (Oak St traffic)",
        });
        return { ...state, parcels: restamped };
      }
      if (sid === "customer_unavailable") {
        // P001 moves to the end of the route as a "rescheduled" stop at 17:00.
        // The rest of the open Driver A route shifts forward — re-stamp ETAs
        // so customers see their new (earlier) delivery windows.
        const aParcels = state.parcels.filter((p) => p.driver === "Driver A");
        const others = state.parcels.filter((p) => p.driver !== "Driver A");
        const reordered = [
          ...aParcels.filter((p) => p.id !== "P001"),
          ...aParcels
            .filter((p) => p.id === "P001")
            .map((p) => ({ ...p, status: "rescheduled" as ParcelStatus, eta: "17:00", delayReasons: [...(p.delayReasons ?? []), "rescheduled · customer not home (17:00)"] })),
        ];
        const restamped = restampDriverARoute([...reordered, ...others], {
          generalTag: "shifted earlier · P001 rescheduled",
        });
        return { ...state, parcels: restamped };
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
        // +15min on P001, cascade to every open Driver A parcel after it.
        const aOrder = state.parcels.filter((p) => p.driver === "Driver A").map((p) => p.id);
        const targetIdx = aOrder.indexOf("P001");
        const cascadeIds = new Set(targetIdx >= 0 ? aOrder.slice(targetIdx) : []);
        return {
          ...state,
          parcels: state.parcels.map((p) => {
            if (!cascadeIds.has(p.id)) return p;
            if (p.status === "delivered" || p.status === "rescheduled") return p;
            if (p.id === "P001") {
              return {
                ...p,
                status: "delayed" as ParcelStatus,
                eta: addMinutes(p.eta, 15),
                delayReasons: [...(p.delayReasons ?? []), "+15min · accident on Oak St"],
              };
            }
            return {
              ...p,
              eta: addMinutes(p.eta, 15),
              delayReasons: [...(p.delayReasons ?? []), "+15min · cascading from P001"],
            };
          }),
        };
      }
      return state;
    }
    case "APPLY_DELAY": {
      const target = state.parcels.find((p) => p.id === action.payload.parcelId);
      if (!target) return state;
      // Find Driver A parcels in route order; cascade the delay to every Driver A
      // parcel at or after the target's index whose status isn't already delivered.
      const aOrder = state.parcels.filter((p) => p.driver === target.driver).map((p) => p.id);
      const targetIdx = aOrder.indexOf(target.id);
      const cascadeIds = new Set(aOrder.slice(targetIdx));
      return {
        ...state,
        pendingFollowUp: null,
        parcels: state.parcels.map((p) => {
          if (!cascadeIds.has(p.id)) return p;
          if (p.status === "delivered") return p;
          if (p.id === action.payload.parcelId) {
            return {
              ...p,
              status: "delayed" as ParcelStatus,
              eta: addMinutes(p.eta, action.payload.minutes),
              delayReasons: [...(p.delayReasons ?? []), `+${action.payload.minutes}min · ${action.payload.reason}`],
            };
          }
          return {
            ...p,
            eta: addMinutes(p.eta, action.payload.minutes),
            delayReasons: [...(p.delayReasons ?? []), `+${action.payload.minutes}min · cascading from ${target.id}`],
          };
        }),
      };
    }
    case "APPLY_AHEAD": {
      const target = state.parcels.find((p) => p.id === action.payload.parcelId);
      if (!target) return state;
      const aOrder = state.parcels.filter((p) => p.driver === target.driver).map((p) => p.id);
      const targetIdx = aOrder.indexOf(target.id);
      const cascadeIds = new Set(aOrder.slice(targetIdx));
      const mins = action.payload.minutes;
      return {
        ...state,
        pendingFollowUp: null,
        parcels: state.parcels.map((p) => {
          if (!cascadeIds.has(p.id)) return p;
          if (p.status === "delivered") return p;
          if (p.id === action.payload.parcelId) {
            return {
              ...p,
              status: "early" as ParcelStatus,
              eta: addMinutes(p.eta, -mins),
              delayReasons: [...(p.delayReasons ?? []), `−${mins}min · ${action.payload.reason}`],
            };
          }
          return {
            ...p,
            eta: addMinutes(p.eta, -mins),
            delayReasons: [...(p.delayReasons ?? []), `−${mins}min · cascading from ${target.id}`],
          };
        }),
      };
    }
    case "TTS_IN_FLIGHT_DELTA":
      return { ...state, ttsInFlight: Math.max(0, state.ttsInFlight + action.payload) };
    case "RAISE_BACK_OFFICE_REC":
      // Don't overwrite an existing recommendation that hasn't been resolved.
      if (state.backOfficeRecommendation) return state;
      return {
        ...state,
        backOfficeRecommendation: action.payload,
        backOfficeNotification: true,
        backOfficeCardOpen: false,
      };
    case "CLEAR_BACK_OFFICE_REC":
      return {
        ...state,
        backOfficeRecommendation: null,
        backOfficeNotification: false,
        backOfficeCardOpen: false,
      };
    case "OPEN_BACK_OFFICE_CARD":
      return { ...state, backOfficeCardOpen: true, backOfficeNotification: false };
    case "CLOSE_BACK_OFFICE_CARD":
      return { ...state, backOfficeCardOpen: false };
    case "SET_BACK_OFFICE_VOICE_STATE":
      return {
        ...state,
        ...(typeof action.payload.speaking === "boolean" ? { backOfficeIsSpeaking: action.payload.speaking } : {}),
        ...(typeof action.payload.listening === "boolean" ? { backOfficeIsListening: action.payload.listening } : {}),
      };
    case "APPLY_BACK_OFFICE_REC": {
      const rec = state.backOfficeRecommendation;
      if (!rec) return state;
      const moveSet = new Set(rec.parcelIdsToMove);
      // Reschedule selected parcels to tomorrow (09:00 onward, spaced 15 min apart in route order).
      // They stay on Driver A's manifest but are marked "rescheduled" so they drop out of today's route.
      const orderedIds = state.parcels
        .filter((p) => moveSet.has(p.id))
        .map((p) => p.id);
      const tomorrowEtaById = new Map<string, string>();
      orderedIds.forEach((id, i) => {
        const total = 9 * 60 + i * 15;
        const h = Math.floor(total / 60);
        const m = total % 60;
        tomorrowEtaById.set(id, `Tmrw ${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      });
      const moved = state.parcels.map((p) => {
        if (!moveSet.has(p.id)) return p;
        const newEta = tomorrowEtaById.get(p.id) ?? "Tmrw 09:00";
        return {
          ...p,
          status: "rescheduled" as ParcelStatus,
          eta: newEta,
          delayReasons: [...(p.delayReasons ?? []), `rescheduled to tomorrow by Back Office Otto (${newEta})`],
        };
      });
      // Restamp Driver A's remaining open route — rescheduled stops are skipped by the restamper.
      const restampedA = restampDriverARoute(moved, { generalTag: "re-sequenced after rebalancing" });
      // Advance currentParcelId if the current one was rescheduled off today's route.
      let nextCurrent = state.currentParcelId;
      if (nextCurrent && moveSet.has(nextCurrent)) {
        const nextOpen = restampedA.find(
          (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early")
        );
        nextCurrent = nextOpen ? nextOpen.id : null;
      }
      return {
        ...state,
        parcels: restampedA,
        currentParcelId: nextCurrent,
        backOfficeRecommendation: null,
        backOfficeNotification: false,
        backOfficeCardOpen: false,
      };
    }
    case "RESET_DEMO":
      return { ...initialState, continuousMode: state.continuousMode, resetSignal: state.resetSignal + 1 };
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
  triggerCustomInboundAlert: (text: string) => void;
  playTtsAlert: (text: string) => void;
  playBackOfficeTts: (text: string) => Promise<void>;
  cancelBackOfficeTts: () => void;
  acceptBackOfficeRec: () => void;
  dismissBackOfficeRec: () => void;
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
  highlight = false,
}: {
  index: string;
  title: string;
  sub?: string;
  tone?: "accent" | "amber" | "rust" | "ink2";
  bg: string;
  children: React.ReactNode;
  highlight?: boolean;
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
          background: highlight ? SI.rustWash : "transparent",
          animation: highlight ? "si-pulse 1.6s ease-in-out infinite" : "none",
          transition: "background 0.3s ease",
        }}
      >
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: highlight ? 5 : 3, background: accent }} />
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
  onStopDemo,
  onReset,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onRunDemo: (startIdx?: number) => void;
  onStopDemo: () => void;
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 24 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: SI.inkFaint, letterSpacing: "0.14em" }}>DRIVER A</span>
        {(["Approaching", "Parked"] as DriverState[]).map((s) => (
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

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {state.isRunningDemo && (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: SI.amberDeep,
              letterSpacing: "0.14em",
              animation: "si-pulse 1.6s ease-in-out infinite",
            }}
          >
● DEMO RUNNING
          </span>
        )}
        {state.isRunningDemo && (
          <button
            data-testid="btn-sim-stop"
            onClick={onStopDemo}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: "#fff",
              background: SI.rustDeep ?? "#a83c2a",
              border: `1px solid ${SI.rustDeep ?? "#a83c2a"}`,
              padding: "5px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ■ Stop
          </button>
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
        {SCENARIOS.map((sc, i) => (
          <button
            key={sc.id}
            data-testid={`btn-sim-run-${i + 1}`}
            onClick={() => onRunDemo(i)}
            disabled={state.isRunningDemo}
            title={sc.title}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: "#fff",
              background: SI.accentDeep,
              border: `1px solid ${SI.accentDeep}`,
              padding: "5px 12px",
              borderRadius: 4,
              cursor: state.isRunningDemo ? "not-allowed" : "pointer",
              opacity: state.isRunningDemo ? 0.55 : 1,
              fontWeight: 600,
            }}
          >
            ▶ Scenario {i + 1}
          </button>
        ))}
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
  // Suppressed during the scripted demo (the demo controls the prompt directly).
  const prevDriverAStateRef = useRef(state.driverAState);
  const scriptedDemoActiveRef = useRef(false);
  useEffect(() => {
    if (
      prevDriverAStateRef.current !== "Approaching" &&
      state.driverAState === "Approaching" &&
      !scriptedDemoActiveRef.current
    ) {
      const nextStop =
        stateRef.current.parcels.find((p) => p.id === stateRef.current.currentParcelId) ??
        stateRef.current.parcels.find(
          (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early")
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
    // Driver A just parked → mark next open delivery complete and announce arrival.
    if (
      prevDriverAStateRef.current !== "Parked" &&
      state.driverAState === "Parked" &&
      !scriptedDemoActiveRef.current
    ) {
      const target =
        stateRef.current.parcels.find(
          (p) => p.id === stateRef.current.currentParcelId && (p.status === "pending" || p.status === "delayed" || p.status === "early")
        ) ??
        stateRef.current.parcels.find(
          (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early")
        );
      if (target) {
        dispatch({ type: "COMPLETE_PARCEL", payload: { parcelId: target.id } });
        dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
        dispatch({ type: "SET_MAP_VISIBLE", payload: false });
        dispatch({ type: "ADD_EVENT", payload: `Driver A parked → ${target.id} marked delivered` });
        playTtsAlert(
          `You've arrived at ${target.address}. I've marked ${target.id} as delivered. I'll also record this parking location to help build our parking hotspots. Nice work.`
        );
      } else {
        dispatch({ type: "ADD_EVENT", payload: `Driver A parked` });
        playTtsAlert(`You've arrived. All deliveries are complete — nice work.`);
      }
    }
    prevDriverAStateRef.current = state.driverAState;
  }, [state.driverAState]);

  // Track the currently playing TTS so a new turn can interrupt it
  // (e.g. user hits "Read it" while Otto is mid-sentence).
  const currentTtsRef = useRef<{ token: number; cancel: () => void } | null>(null);
  const ttsTokenRef = useRef(0);

  const playTtsAlert = async (text: string): Promise<void> => {
    // If a previous TTS is still playing, cancel it so the new message starts
    // immediately instead of overlapping.
    if (currentTtsRef.current) {
      try { currentTtsRef.current.cancel(); } catch { /* ignore */ }
      currentTtsRef.current = null;
    }
    const myToken = ++ttsTokenRef.current;
    // Track every TTS turn from invocation through completion so the
    // continuous-mode recognizer can wait for the whole turn — including the
    // async fetch latency before isSpeaking flips true.
    dispatch({ type: "TTS_IN_FLIGHT_DELTA", payload: 1 });
    const markStart = () => {
      dispatch({ type: "SET_SPOKEN_CAPTION", payload: text });
      dispatch({ type: "SET_SPEAKING", payload: true });
    };
    const markEnd = () => dispatch({ type: "SET_SPEAKING", payload: false });
    const finish = () => dispatch({ type: "TTS_IN_FLIGHT_DELTA", payload: -1 });
    const isCurrent = () => ttsTokenRef.current === myToken;
    try {
      try {
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "nova" }),
        });
        // Another turn may have superseded us during the fetch — abort.
        if (!isCurrent()) return;
        if (ttsRes.ok) {
          const blob = await ttsRes.blob();
          if (!isCurrent()) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          markStart();
          return await new Promise<void>((resolve) => {
            let resolved = false;
            const done = () => {
              if (resolved) return;
              resolved = true;
              if (isCurrent()) markEnd();
              if (currentTtsRef.current?.token === myToken) currentTtsRef.current = null;
              resolve();
            };
            currentTtsRef.current = {
              token: myToken,
              cancel: () => {
                try { audio.pause(); } catch { /* ignore */ }
                try { audio.currentTime = 0; } catch { /* ignore */ }
                done();
              },
            };
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch(done);
          });
        }
      } catch {
        /* fall through */
      }
      if (!isCurrent()) return;
      if ("speechSynthesis" in window) {
        return await new Promise<void>((resolve) => {
          let resolved = false;
          const utt = new SpeechSynthesisUtterance(text);
          utt.rate = 1;
          utt.onstart = markStart;
          const done = () => {
            if (resolved) return;
            resolved = true;
            if (isCurrent()) markEnd();
            if (currentTtsRef.current?.token === myToken) currentTtsRef.current = null;
            resolve();
          };
          utt.onend = done;
          utt.onerror = done;
          currentTtsRef.current = {
            token: myToken,
            cancel: () => {
              try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
              done();
            },
          };
          window.speechSynthesis.speak(utt);
        });
      }
    } finally {
      finish();
    }
  };

  // Independent TTS channel for Back Office Otto so he can speak without
  // colliding with in-cab Otto. Uses a different OpenAI voice ("shimmer")
  // and tracks its own speaking state.
  const backOfficeTtsRef = useRef<{ token: number; cancel: () => void } | null>(null);
  const backOfficeTtsTokenRef = useRef(0);

  const playBackOfficeTts = async (text: string): Promise<void> => {
    if (backOfficeTtsRef.current) {
      try { backOfficeTtsRef.current.cancel(); } catch { /* ignore */ }
      backOfficeTtsRef.current = null;
    }
    const myToken = ++backOfficeTtsTokenRef.current;
    const isCurrent = () => backOfficeTtsTokenRef.current === myToken;
    const markStart = () => dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { speaking: true } });
    const markEnd = () => dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { speaking: false } });
    try {
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "shimmer" }),
      });
      if (!isCurrent()) return;
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        if (!isCurrent()) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        markStart();
        return await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (resolved) return;
            resolved = true;
            if (isCurrent()) markEnd();
            if (backOfficeTtsRef.current?.token === myToken) backOfficeTtsRef.current = null;
            resolve();
          };
          backOfficeTtsRef.current = {
            token: myToken,
            cancel: () => {
              try { audio.pause(); } catch { /* ignore */ }
              try { audio.currentTime = 0; } catch { /* ignore */ }
              done();
            },
          };
          audio.onended = done;
          audio.onerror = done;
          audio.play().catch(done);
        });
      }
    } catch {
      /* fall through to speech synthesis */
    }
    if (!isCurrent()) return;
    if ("speechSynthesis" in window) {
      return await new Promise<void>((resolve) => {
        let resolved = false;
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 1;
        utt.pitch = 0.9;
        utt.onstart = markStart;
        const done = () => {
          if (resolved) return;
          resolved = true;
          if (isCurrent()) markEnd();
          if (backOfficeTtsRef.current?.token === myToken) backOfficeTtsRef.current = null;
          resolve();
        };
        utt.onend = done;
        utt.onerror = done;
        backOfficeTtsRef.current = {
          token: myToken,
          cancel: () => {
            try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
            done();
          },
        };
        window.speechSynthesis.speak(utt);
      });
    }
  };

  const resolveDelayParcel = (ref: string | undefined): Parcel | null => {
    const aRoute = stateRef.current.parcels.filter((p) => p.driver === "Driver A");
    const aOpen = aRoute.filter((p) => p.status === "pending" || p.status === "delayed" || p.status === "early");
    if (aRoute.length === 0) return null;
    const isAtStop = stateRef.current.driverAState === "Parked" || stateRef.current.driverAState === "Approaching";
    const cleaned = (ref ?? "").toLowerCase().trim();
    if (!cleaned || /\b(next|upcoming|following)\b/.test(cleaned)) {
      const current = aOpen.find((p) => p.id === stateRef.current.currentParcelId);
      if (current) return current;
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
    } else if (intent === "query_next_stop") {
      // Find the delivery AFTER the current one on Driver A's open route.
      const aOpen = stateRef.current.parcels.filter(
        (p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early")
      );
      const curId = stateRef.current.currentParcelId;
      const curIdx = curId ? aOpen.findIndex((p) => p.id === curId) : -1;
      const next = curIdx >= 0 ? aOpen[curIdx + 1] : aOpen[0];
      if (next) {
        const delayed = next.status === "delayed" ? " — currently flagged as delayed" : "";
        const msg = `Your next stop after the current one is ${next.id}, ${next.customer} at ${next.address}, ETA ${next.eta}${delayed}.`;
        dispatch({ type: "ADD_EVENT", payload: `Driver A: query_next_stop → ${next.id} (${next.eta})` });
        playTtsAlert(msg);
      } else {
        dispatch({ type: "ADD_EVENT", payload: `Driver A: query_next_stop → no upcoming stop` });
        playTtsAlert("You have no more stops after the current one.");
      }
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
        playTtsAlert("Which delivery is the delay for? You can say 'next', the parcel number, or the street.");
      }
    } else if (intent === "ahead_reported") {
      const target = resolveDelayParcel(extras.parcelRef);
      if (target) {
        const label = `${target.id} — ${target.address} (${target.customer})`;
        if (typeof extras.minutes === "number" && extras.reason) {
          dispatch({ type: "APPLY_AHEAD", payload: { parcelId: target.id, minutes: extras.minutes, reason: extras.reason } });
          dispatch({ type: "SET_INTENT", payload: { intent: "ahead_reported", entity: `${target.id} −${extras.minutes}min · ${extras.reason}` } });
          dispatch({ type: "ADD_EVENT", payload: `Driver A: ${target.id} ahead −${extras.minutes}min — ${extras.reason}` });
          playTtsAlert(`Nice. ${target.id} on ${target.address} pulled forward ${extras.minutes} minutes — ${extras.reason}.`);
        } else {
          const missing: string[] = [];
          if (typeof extras.minutes !== "number") missing.push("how many minutes");
          if (!extras.reason) missing.push("how come");
          const question =
            missing.length === 2
              ? "How many minutes ahead are you, and how come?"
              : missing[0] === "how many minutes"
                ? "How many minutes ahead are you?"
                : "How come?";
          dispatch({
            type: "SET_PENDING_FOLLOWUP",
            payload: { type: "ahead_details", parcelId: target.id, parcelLabel: label, question, knownMinutes: extras.minutes ?? null, knownReason: extras.reason ?? null },
          });
          dispatch({ type: "ADD_EVENT", payload: `Driver A: ahead_reported for ${target.id} (${target.address})` });
          playTtsAlert(`Nice. For ${target.address}, ${question}`);
        }
      } else {
        dispatch({ type: "ADD_EVENT", payload: `Driver A: ahead_reported but no matching parcel found` });
        playTtsAlert("Which delivery are you ahead on? You can say 'next', the parcel number, or the street.");
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
    playTtsAlert(`You have a new notification. Would you like to hear it?`);
  };

  // ---------------- Back Office Otto trigger + actions ----------------
  // Idempotency guard: remember the last parcel-snapshot we already raised on
  // so re-renders or unrelated state changes can't re-fire the effect.
  const lastRaisedSnapshotRef = useRef<string | null>(null);
  // Clear the idempotency key on Reset so a fresh demo run can re-trigger.
  useEffect(() => {
    if (state.resetSignal > 0) lastRaisedSnapshotRef.current = null;
  }, [state.resetSignal]);
  // Watches the parcel plan for piling delays on Driver A and raises a
  // rebalancing recommendation when the threshold is exceeded.
  useEffect(() => {
    if (stateRef.current.backOfficeRecommendation) return;
    if (state.backOfficeRecommendation) return;
    const aOpen = state.parcels.filter(
      (p) => p.driver === "Driver A" && p.status !== "delivered" && p.status !== "rescheduled"
    );
    if (aOpen.length < 2) return;
    const totalDelayMin = aOpen.reduce((sum, p) => {
      const diff = timeToMin(p.eta) - timeToMin(p.originalEta);
      return sum + Math.max(0, diff);
    }, 0);
    const delayedCount = aOpen.filter((p) => p.status === "delayed").length;
    // Hard-cutoff trigger: any single parcel slipping ≥15 min past its
    // original committed window counts as a customer-window breach.
    const hardCutoffBreach = aOpen.find(
      (p) => timeToMin(p.eta) - timeToMin(p.originalEta) >= 15
    );
    const trigger = totalDelayMin >= 25 || delayedCount >= 2 || !!hardCutoffBreach;
    if (!trigger) return;
    // Pick the latest N open parcels (preserve route order; take from the tail)
    // and reschedule them to tomorrow. Move at most 2, at least 1, and never
    // the current parcel the driver is actively working.
    const movable = aOpen.filter((p) => p.id !== state.currentParcelId);
    if (movable.length === 0) return;
    const moveCount = Math.min(2, movable.length);
    const toMove = movable.slice(-moveCount);
    const moveLabels = toMove.map((p) => `${p.id} — ${p.address}`).join(" and ");
    const summary = `Driver A is ${totalDelayMin} min behind across ${aOpen.length} stops (${delayedCount} flagged delayed). I'd reschedule ${moveCount === 1 ? "the last stop" : `the last ${moveCount} stops`} (${moveLabels}) to tomorrow so Driver A can catch up.`;
    const narration = `Heads up — Driver A is now about ${totalDelayMin} minutes behind across ${aOpen.length} stops. I'd recommend rescheduling ${moveLabels} to tomorrow. Want to accept?`;
    const now = new Date();
    const stamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    const snapshotKey = `${totalDelayMin}|${delayedCount}|${hardCutoffBreach?.id ?? ""}|${toMove.map((p) => p.id).join(",")}`;
    if (lastRaisedSnapshotRef.current === snapshotKey) return;
    lastRaisedSnapshotRef.current = snapshotKey;
    const reason = hardCutoffBreach
      ? `customer window breach on ${hardCutoffBreach.id}`
      : delayedCount >= 2
        ? "multiple delayed stops"
        : "cumulative delay over threshold";
    const rec: BackOfficeRec = {
      id: `bo-${Date.now()}`,
      reason,
      parcelIdsToMove: toMove.map((p) => p.id),
      summary,
      narration,
      createdAt: stamp,
      totalDelayMin,
    };
    dispatch({ type: "RAISE_BACK_OFFICE_REC", payload: rec });
    dispatch({ type: "ADD_EVENT", payload: `Back Office Otto: new rebalancing recommendation (${totalDelayMin} min behind, ${delayedCount} delayed)` });
    // Note: Otto stays silent until the dispatcher presses the play button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.parcels]);

  const acceptBackOfficeRec = async () => {
    const rec = stateRef.current.backOfficeRecommendation;
    if (!rec) return;
    const moveLabels = rec.parcelIdsToMove
      .map((id) => stateRef.current.parcels.find((p) => p.id === id))
      .filter((p): p is Parcel => !!p)
      .map((p) => `${p.id} — ${p.address}`)
      .join(", ");
    const moveCount = rec.parcelIdsToMove.length;
    dispatch({ type: "APPLY_BACK_OFFICE_REC" });
    dispatch({ type: "ADD_EVENT", payload: `Dispatcher accepted Back Office Otto's rebalancing → rescheduled ${moveLabels} to tomorrow` });
    // 1) Back office Otto speaks first — wait for it to finish before driver Otto chimes in.
    await playBackOfficeTts("Done. I've rescheduled the stops to tomorrow and refreshed Driver A's route.");
    // 2) Driver Otto then queues an inbound notification using the standard
    //    "you have a new notification, do you want to hear it?" pattern — the
    //    full rebalance message is delivered only after the driver answers yes.
    const summary = `dispatch rebalance — ${moveCount === 1 ? "1 stop" : `${moveCount} stops`} rescheduled to tomorrow`;
    const fullMessage = `Dispatch rescheduled ${moveCount === 1 ? "one stop" : `${moveCount} stops`} on your route to tomorrow. Your remaining ETAs are updated.`;
    const question = "New notification from dispatch. Would you like to hear it?";
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: relaying rebalance alert (awaiting yes/no)` });
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "inbound_alert", scenarioId: null, summary, fullMessage, question },
    });
    playTtsAlert("You have a new notification. Would you like to hear it?");
  };

  const cancelBackOfficeTts = () => {
    // Bump the token first so any in-flight fetch resolving after this point
    // sees isCurrent() === false and won't start playback.
    backOfficeTtsTokenRef.current += 1;
    if (backOfficeTtsRef.current) {
      try { backOfficeTtsRef.current.cancel(); } catch { /* ignore */ }
      backOfficeTtsRef.current = null;
    }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { speaking: false, listening: false } });
  };

  const dismissBackOfficeRec = () => {
    dispatch({ type: "CLEAR_BACK_OFFICE_REC" });
    dispatch({ type: "ADD_EVENT", payload: `Dispatcher dismissed Otto's rebalancing suggestion` });
    cancelBackOfficeTts();
  };

  const triggerCustomInboundAlert = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const summary = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
    const fullMessage = `Driver B says: ${trimmed}`;
    const question = "New custom message from Driver B. Would you like to hear it?";
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: ${summary}` });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: relaying custom alert (awaiting yes/no)` });
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "inbound_alert", scenarioId: null, summary, fullMessage, question },
    });
    playTtsAlert("You have a new message from Driver B. Would you like to hear it?");
  };

  const demoRunIdRef = useRef(0);
  const waitResolversRef = useRef<Array<() => void>>([]);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        waitResolversRef.current = waitResolversRef.current.filter((r) => r !== resolve);
        resolve();
      }, ms);
      demoTimers.current.push(t);
      waitResolversRef.current.push(resolve);
    });

  // Resolves all hanging wait() promises so cancelled runners unwind to the next cancellation check.
  const flushWaits = () => {
    const pending = waitResolversRef.current;
    waitResolversRef.current = [];
    pending.forEach((r) => r());
  };

  const cancelled = (runId: number) => runId !== demoRunIdRef.current;

  // --- Scenario beats ---
  const runScenarioNavigation = async (runId: number) => {
    await wait(500);
    if (cancelled(runId)) return;
    const cur =
      stateRef.current.parcels.find((p) => p.id === stateRef.current.currentParcelId) ??
      stateRef.current.parcels.find((p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early"));
    const addr = cur?.address ?? "your next stop";
    const id = cur?.id ?? "next";
    dispatch({ type: "SET_DRIVER_A_STATE", payload: "Approaching" });
    dispatch({ type: "ADD_EVENT", payload: `Driver A approaching ${id}` });

    await wait(500);
    if (cancelled(runId)) return;
    const q = `You're getting close to ${addr}. Want me to open the navigation app and show some parking hotspots nearby?`;
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "confirm_navigation", question: q, contextLabel: `${id} — ${addr}` },
    });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: approach prompt (awaiting yes/no)` });
    await playTtsAlert(q);
    if (cancelled(runId)) return;

    await wait(900);
    if (cancelled(runId)) return;
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: "" } });
    dispatch({ type: "SET_MAP_OPENING", payload: true });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: confirmed → opening navigation…` });
    const openTts = playTtsAlert("Opening the map and pulling up parking hotspots near you.");
    await wait(1600);
    if (cancelled(runId)) return;
    dispatch({ type: "SET_MAP_VISIBLE", payload: true });
    dispatch({ type: "ADD_EVENT", payload: `Map opened — parking hotspots loaded` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    await openTts;
  };

  const runScenarioDelay = async (runId: number) => {
    await wait(700);
    if (cancelled(runId)) return;
    const target =
      stateRef.current.parcels.find((p) => p.id === stateRef.current.currentParcelId)
      ?? stateRef.current.parcels.find((p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early"))
      ?? stateRef.current.parcels.find((p) => p.driver === "Driver A");
    if (!target) return;

    // Driver A speaks
    dispatch({ type: "SET_TRANSCRIPT", payload: "There's heavy traffic — I'll be about ten minutes late to my next delivery." });
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_reported", entity: `${target.id} +10min · heavy traffic` } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: delay_reported for ${target.id} (heavy traffic, +10min)` });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: target.id, minutes: 10, reason: "heavy traffic" } });

    await wait(900);
    if (cancelled(runId)) return;
    await playTtsAlert(
      `Got it — I've pushed your ETA for ${target.id} back ten minutes for heavy traffic and let dispatch know.`
    );
  };

  const runScenarioReroute = async (runId: number) => {
    await wait(600);
    if (cancelled(runId)) return;
    // Driver B reports the closure to dispatch.
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: Maple Avenue closed for construction` });
    dispatch({ type: "ADD_EVENT", payload: `REROUTE ALERT: Generating alternate routes for Driver A...` });

    await wait(900);
    if (cancelled(runId)) return;
    // Driver A is the one impacted. Inline the inbound-alert flow so we can
    // await the question TTS to fully finish before auto-accepting — otherwise
    // the next playTtsAlert would cancel "Would you like to hear it?" mid-sentence.
    const sc = DRIVER_B_SCENARIOS.maple_closed;
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: ${sc.summary}` });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: relaying alert (awaiting yes/no)` });
    const question = `New notification from Driver B about ${sc.summary.toLowerCase()}. Would you like to hear it?`;
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "inbound_alert", scenarioId: "maple_closed", summary: sc.summary, fullMessage: sc.fullMessage, question },
    });
    await playTtsAlert("You have a new notification. Would you like to hear it?");
    if (cancelled(runId)) return;

    // Brief beat, then auto-accept on Driver A's behalf so the script keeps moving.
    await wait(700);
    if (cancelled(runId)) return;
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: "maple_closed" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: accepted alert "${sc.summary}"` });
    dispatch({ type: "APPLY_INBOUND_SCENARIO", payload: { scenarioId: "maple_closed" } });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: ${sc.fullMessage}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    await playTtsAlert(sc.fullMessage);
  };

  const runScenarioBackOffice = async (runId: number) => {
    await wait(500);
    if (cancelled(runId)) return;

    // Beat 1 — Driver A voice-reports a delay on P002.
    dispatch({ type: "SET_TRANSCRIPT", payload: "Hey Otto, I'll be 15 minutes late on parcel two — heavy traffic on Maple" });
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_reported", entity: "P002" } });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: "P002", minutes: 15, reason: "heavy traffic" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: delay_reported P002 (+15m heavy traffic)` });
    await playTtsAlert("Got it. Parcel two on Maple Avenue pushed back fifteen minutes for heavy traffic. I've let dispatch know.");
    if (cancelled(runId)) return;

    await wait(900);
    if (cancelled(runId)) return;

    // Beat 2 — second delay on P003 trips the back-office trigger threshold.
    dispatch({ type: "SET_TRANSCRIPT", payload: "Otto, parcel three is also going to be late — about 15 minutes for construction" });
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_reported", entity: "P003" } });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: "P003", minutes: 15, reason: "construction" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: delay_reported P003 (+15m construction)` });
    await playTtsAlert("Got it. Parcel three on Pine Road pushed back fifteen minutes for construction. Dispatch is updated.");
    if (cancelled(runId)) return;

    // Beat 3 — wait for the back-office watcher effect to raise a recommendation.
    let waited = 0;
    while (!stateRef.current.backOfficeRecommendation && waited < 3000) {
      await wait(150);
      waited += 150;
      if (cancelled(runId)) return;
    }
    const rec = stateRef.current.backOfficeRecommendation;
    if (!rec) return;

    await wait(700);
    if (cancelled(runId)) return;

    // Beat 4 — back-office Otto narrates the recommendation (auto-press AI button).
    await playBackOfficeTts(rec.narration);
    if (cancelled(runId)) return;

    await wait(700);
    if (cancelled(runId)) return;

    // Beat 5 — dispatcher accepts. Apply the rebalance and have Otto confirm.
    const moveLabels = rec.parcelIdsToMove
      .map((id) => stateRef.current.parcels.find((p) => p.id === id))
      .filter((p): p is Parcel => !!p)
      .map((p) => `${p.id} — ${p.address}`)
      .join(", ");
    const moveCount = rec.parcelIdsToMove.length;
    dispatch({ type: "APPLY_BACK_OFFICE_REC" });
    dispatch({ type: "ADD_EVENT", payload: `Dispatcher accepted Back Office Otto's rebalancing → rescheduled ${moveLabels} to tomorrow` });
    await playBackOfficeTts("Done. I've rescheduled the stops to tomorrow and refreshed Driver A's route.");
    if (cancelled(runId)) return;

    await wait(500);
    if (cancelled(runId)) return;

    // Beat 6 — driver A gets the standard inbound notification handshake.
    const summary = `dispatch rebalance — ${moveCount === 1 ? "1 stop" : `${moveCount} stops`} rescheduled to tomorrow`;
    const fullMessage = `Dispatch rescheduled ${moveCount === 1 ? "one stop" : `${moveCount} stops`} on your route to tomorrow. Your remaining ETAs are updated.`;
    const question = "New notification from dispatch. Would you like to hear it?";
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: relaying rebalance alert (awaiting yes/no)` });
    dispatch({
      type: "SET_PENDING_FOLLOWUP",
      payload: { type: "inbound_alert", scenarioId: null, summary, fullMessage, question },
    });
    await playTtsAlert("You have a new notification. Would you like to hear it?");
    if (cancelled(runId)) return;

    await wait(700);
    if (cancelled(runId)) return;

    // Beat 7 — auto-accept on Driver A's behalf and play the rebalance message.
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: "rebalance" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: accepted alert "${summary}"` });
    dispatch({ type: "ADD_EVENT", payload: `StreetIQ → Driver A: ${fullMessage}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    await playTtsAlert(fullMessage);
  };

  const SCENARIO_RUNNERS: Array<(runId: number) => Promise<void>> = [
    runScenarioNavigation,
    runScenarioDelay,
    runScenarioReroute,
    runScenarioBackOffice,
  ];

  const queueScenario = (idx: number) => {
    if (idx >= SCENARIOS.length) {
      scriptedDemoActiveRef.current = false;
      dispatch({ type: "SET_RUNNING_DEMO", payload: false });
      dispatch({ type: "SET_SCENARIO_GATE", payload: { idx: -1, awaiting: false } });
      return;
    }
    dispatch({ type: "SET_SCENARIO_GATE", payload: { idx, awaiting: true } });
  };

  const runSingleRef = useRef(false);

  const handleRunDemo = (startIdx?: number) => {
    // Bump runId so any in-flight runner from a previous run becomes cancelled.
    demoRunIdRef.current += 1;
    clearDemoTimers();
    flushWaits();
    scriptedDemoActiveRef.current = true;
    runSingleRef.current = typeof startIdx === "number";
    dispatch({ type: "RESET_DEMO" });
    dispatch({ type: "SET_RUNNING_DEMO", payload: true });
    queueScenario(typeof startIdx === "number" ? startIdx : 0);
  };

  const handleStartScenario = async () => {
    const idx = stateRef.current.scenarioIdx;
    if (idx < 0 || idx >= SCENARIO_RUNNERS.length) return;
    const myRunId = demoRunIdRef.current;
    dispatch({ type: "SET_SCENARIO_GATE", payload: { idx, awaiting: false } });
    try {
      await SCENARIO_RUNNERS[idx](myRunId);
    } finally {
      if (myRunId === demoRunIdRef.current) {
        if (runSingleRef.current) {
          // Single-scenario mode: end the demo run after this one finishes.
          scriptedDemoActiveRef.current = false;
          runSingleRef.current = false;
          dispatch({ type: "SET_RUNNING_DEMO", payload: false });
          dispatch({ type: "SET_SCENARIO_GATE", payload: { idx: -1, awaiting: false } });
        } else {
          await wait(600);
          if (myRunId === demoRunIdRef.current) {
            queueScenario(idx + 1);
          }
        }
      }
    }
  };

  const handleSkipScenario = () => {
    const idx = stateRef.current.scenarioIdx;
    queueScenario(idx + 1);
  };

  const handleStopDemo = () => {
    demoRunIdRef.current += 1;
    scriptedDemoActiveRef.current = false;
    runSingleRef.current = false;
    clearDemoTimers();
    flushWaits();
    // Bump the TTS token so any in-flight fetch resolves into a no-op,
    // then cancel currently-playing audio (HTML <audio> + Web Speech).
    ttsTokenRef.current += 1;
    if (currentTtsRef.current) {
      try { currentTtsRef.current.cancel(); } catch { /* ignore */ }
      currentTtsRef.current = null;
    }
    try { cancelBackOfficeTts(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    dispatch({ type: "SET_SPEAKING", payload: false });
    dispatch({ type: "SET_RUNNING_DEMO", payload: false });
    dispatch({ type: "SET_SCENARIO_GATE", payload: { idx: -1, awaiting: false } });
    dispatch({ type: "ADD_EVENT", payload: `Scripted demo stopped by user` });
    // Also reset the scenario state so the next run starts from a clean board.
    dispatch({ type: "RESET_DEMO" });
  };

  const handleReset = () => {
    demoRunIdRef.current += 1;
    scriptedDemoActiveRef.current = false;
    clearDemoTimers();
    flushWaits();
    try { window.speechSynthesis?.cancel(); } catch {}
    dispatch({ type: "RESET_DEMO" });
  };

  return (
    <DemoContext.Provider value={{ state, dispatch, processIntent, triggerInboundAlert, triggerCustomInboundAlert, playTtsAlert, playBackOfficeTts, cancelBackOfficeTts, acceptBackOfficeRec, dismissBackOfficeRec }}>
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
        <TopBar state={state} dispatch={dispatch} onRunDemo={handleRunDemo} onStopDemo={handleStopDemo} onReset={handleReset} />

        {state.awaitingScenarioStart && state.scenarioIdx >= 0 && state.scenarioIdx < SCENARIOS.length && (
          <div
            data-testid="scenario-modal"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(10, 22, 40, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              backdropFilter: "blur(2px)",
            }}
          >
            <div
              style={{
                background: SI.surface,
                border: `1px solid ${SI.hair}`,
                borderLeft: `4px solid ${SI.accentDeep}`,
                borderRadius: 12,
                padding: "22px 26px",
                width: "min(460px, 92vw)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: SI.accentDeep,
                  letterSpacing: "0.18em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Scripted Demo · {state.scenarioIdx + 1} of {SCENARIOS.length}
              </div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 20, color: SI.ink, fontWeight: 600, lineHeight: 1.25 }}>
                {SCENARIOS[state.scenarioIdx].title}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: SI.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
                {SCENARIOS[state.scenarioIdx].description}
              </div>
              <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  data-testid="btn-scenario-skip"
                  onClick={handleSkipScenario}
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 500,
                    color: SI.inkSoft,
                    background: "transparent",
                    border: `1px solid ${SI.hair}`,
                    padding: "8px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
                <button
                  data-testid="btn-scenario-start"
                  onClick={handleStartScenario}
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: SI.accentDeep,
                    border: `1px solid ${SI.accentDeep}`,
                    padding: "8px 18px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  ▶ Start
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1×4 panel row — falls back to horizontal scroll under 1280px */}
        <div className="si-panel-row" style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflowX: "auto" }}>
          <PanelShell index="01" title="Voice Cockpit" sub="Driver A" tone="accent" bg={SI.bg}>
            <PanelOne />
          </PanelShell>
          {(state.mapVisible || state.mapOpening) && (
            <PanelShell index="" title="Map" sub="shared layer" tone="amber" bg={SI.bgDeep}>
              <PanelTwo />
            </PanelShell>
          )}
          <PanelShell index="02" title="Dispatch" sub="6 stops · Driver A" tone="rust" bg={SI.bg} highlight={state.backOfficeNotification}>
            <PanelThree />
          </PanelShell>
          <PanelShell index="03" title="Driver B Quick Actions" sub="Driver B → A" tone="ink2" bg={SI.bgDeep}>
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

  const acceptInboundAlert = (alert: { scenarioId: DriverBScenarioId | null; summary: string; fullMessage: string }) => {
    dispatch({ type: "SET_INTENT", payload: { intent: "confirm_yes", entity: alert.scenarioId ?? "custom" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: accepted alert "${alert.summary}"` });
    if (alert.scenarioId) {
      dispatch({ type: "APPLY_INBOUND_SCENARIO", payload: { scenarioId: alert.scenarioId } });
    }
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

  const continuousModeRef = useRef(state.continuousMode);
  useEffect(() => {
    continuousModeRef.current = state.continuousMode;
  }, [state.continuousMode]);

  const isSpeakingRef = useRef(state.isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = state.isSpeaking;
  }, [state.isSpeaking]);

  const ttsInFlightRef = useRef(state.ttsInFlight);
  useEffect(() => {
    ttsInFlightRef.current = state.ttsInFlight;
  }, [state.ttsInFlight]);

  const sessionActiveRef = useRef(false);
  const [sessionActive, setSessionActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const cycleInFlightRef = useRef(false);

  const setSessionActiveBoth = (v: boolean) => {
    sessionActiveRef.current = v;
    setSessionActive(v);
  };

  const stopSession = (logEvent = true) => {
    const wasActive = sessionActiveRef.current;
    setSessionActiveBoth(false);
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.stop();
      } catch {
        // recognition may already be stopped — safe to ignore
      }
      recognitionRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    cycleInFlightRef.current = false;
    dispatch({ type: "SET_LISTENING", payload: false });
    if (wasActive && logEvent) {
      dispatch({ type: "ADD_EVENT", payload: "Driver A: continuous voice session ended" });
    }
  };

  // End any active session if the toggle is turned off mid-session.
  useEffect(() => {
    if (!state.continuousMode && sessionActiveRef.current) stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.continuousMode]);

  // End any active session when the user hits Reset.
  useEffect(() => {
    if (state.resetSignal > 0 && sessionActiveRef.current) stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resetSignal]);

  // When continuous mode is on, automatically open the microphone so the driver
  // can speak hands-free. This fires both when continuous mode is first turned
  // on and whenever a follow-up question becomes pending (e.g. an inbound
  // Driver B notification asking "Would you like to hear it?").
  useEffect(() => {
    if (!state.continuousMode) return;
    if (sessionActiveRef.current) return;
    if (state.isListening) return;
    setSessionActiveBoth(true);
    dispatch({ type: "ADD_EVENT", payload: "Driver A: continuous voice session started" });
    // Wait until Otto has finished any in-flight TTS, then start listening.
    (async () => {
      await waitWhileSpeaking();
      if (sessionActiveRef.current && continuousModeRef.current) startRecognitionCycle();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingFollowUp, state.continuousMode]);

  // Cleanup on unmount.
  useEffect(() => () => stopSession(false), []);

  // Wait until Otto has nothing in-flight or actively speaking. We give a
  // brief grace window so a TTS turn that was just dispatched (fetch still
  // resolving, isSpeaking not yet true) is observed before we return.
  const waitWhileSpeaking = () =>
    new Promise<void>((resolve) => {
      const isBusy = () => isSpeakingRef.current || ttsInFlightRef.current > 0;
      const startedAt = Date.now();
      const graceMs = 250;
      const tick = () => {
        if (!sessionActiveRef.current) {
          window.clearInterval(t);
          return resolve();
        }
        if (isBusy()) return; // interval keeps polling
        // Not busy — but if we're still inside the grace window and nothing
        // has registered yet, keep waiting briefly for an in-flight TTS.
        if (Date.now() - startedAt < graceMs) return;
        window.clearInterval(t);
        resolve();
      };
      const t = window.setInterval(tick, 60);
    });

  const startRecognitionCycle = () => {
    // Single-flight: never start a new cycle while one is in flight.
    if (cycleInFlightRef.current) return;
    cycleInFlightRef.current = true;
    dispatch({ type: "SET_LISTENING", payload: true });
    try {
      const SpeechRecognitionCtor =
        (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
        (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;
        // Per-cycle guard: only one of onresult/onerror/onend may schedule a restart.
        let restartScheduled = false;
        const scheduleRestart = (delayMs: number, waitForSpeech: boolean) => {
          if (restartScheduled) return;
          restartScheduled = true;
          if (recognitionRef.current === recognition) recognitionRef.current = null;
          cycleInFlightRef.current = false;
          (async () => {
            if (waitForSpeech) await waitWhileSpeaking();
            await new Promise((r) => setTimeout(r, delayMs));
            if (sessionActiveRef.current && continuousModeRef.current) startRecognitionCycle();
          })();
        };
        recognition.onresult = async (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          dispatch({ type: "SET_TRANSCRIPT", payload: transcript });
          dispatch({ type: "SET_LISTENING", payload: false });
          await routeTranscript(transcript);
          if (sessionActiveRef.current && continuousModeRef.current) {
            scheduleRestart(350, true);
          } else {
            restartScheduled = true;
            cycleInFlightRef.current = false;
          }
        };
        recognition.onerror = () => {
          dispatch({ type: "SET_LISTENING", payload: false });
          if (sessionActiveRef.current && continuousModeRef.current) {
            scheduleRestart(600, false);
          } else {
            restartScheduled = true;
            cycleInFlightRef.current = false;
          }
        };
        recognition.onend = () => {
          // Only restart from onend if no result/error already scheduled one.
          if (restartScheduled) return;
          if (sessionActiveRef.current && continuousModeRef.current && recognitionRef.current === recognition) {
            scheduleRestart(250, true);
          } else {
            cycleInFlightRef.current = false;
          }
        };
        recognition.start();
      } else {
        fallbackTimerRef.current = window.setTimeout(async () => {
          fallbackTimerRef.current = null;
          const pending = followUpRef.current;
          let fallback: string;
          if (pending?.type === "delay_details") fallback = "about 15 minutes, heavy traffic";
          else if (pending?.type === "ahead_details") fallback = "about 10 minutes, light traffic";
          else if (pending?.type === "confirm_navigation") fallback = "yes please";
          else fallback = "I will be delayed for the next parcel";
          dispatch({ type: "SET_TRANSCRIPT", payload: fallback });
          dispatch({ type: "SET_LISTENING", payload: false });
          await routeTranscript(fallback);
          cycleInFlightRef.current = false;
          if (sessionActiveRef.current && continuousModeRef.current) {
            await waitWhileSpeaking();
            await new Promise((r) => setTimeout(r, 350));
            if (sessionActiveRef.current && continuousModeRef.current) startRecognitionCycle();
          }
        }, 2000);
      }
    } catch {
      cycleInFlightRef.current = false;
      dispatch({ type: "SET_LISTENING", payload: false });
    }
  };

  const handleMicClick = async () => {
    // In continuous mode, a tap during an active session ends it.
    if (sessionActiveRef.current) {
      stopSession();
      return;
    }
    if (state.isListening) return;
    if (state.continuousMode) {
      setSessionActiveBoth(true);
      dispatch({ type: "ADD_EVENT", payload: "Driver A: continuous voice session started" });
    }
    startRecognitionCycle();
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

  const handleInboundAnswer = (text: string, alert: { scenarioId: DriverBScenarioId | null; summary: string; fullMessage: string }) => {
    const ans = parseYesNo(text);
    if (ans === "yes") acceptInboundAlert(alert);
    else if (ans === "no") declineInboundAlert(alert);
    else acceptInboundAlert(alert);
  };

  const routeTranscript = async (text: string) => {
    const pending = followUpRef.current;
    if (pending && pending.type === "delay_details" && !looksLikeFreshIntent(text)) {
      await handleDelayDetails(text, pending);
    } else if (pending && pending.type === "ahead_details" && !looksLikeFreshIntent(text)) {
      await handleAheadDetails(text, pending);
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
    const knownMinutes = pending.knownMinutes ?? null;
    let minutes: number | null = knownMinutes;
    let reason = pending.knownReason ?? "unspecified";
    let aiMinutes: number | null = null;
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mode: "delay_details" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Number.isFinite(data.minutes)) {
          aiMinutes = Math.max(1, Math.round(data.minutes));
          minutes = aiMinutes;
        }
        if (typeof data.reason === "string" && data.reason.length > 0 && data.reason !== "unspecified") reason = data.reason;
      } else {
        const fb = parseDurationAndReason(text);
        if (fb.minutes !== null) minutes = fb.minutes;
        if (fb.reason !== "unspecified") reason = fb.reason;
      }
    } catch {
      const fb = parseDurationAndReason(text);
      if (fb.minutes !== null) minutes = fb.minutes;
      if (fb.reason !== "unspecified") reason = fb.reason;
    }
    // Last-resort: if AI didn't return a number, try local parser on the text.
    if (minutes === null) {
      const fb = parseDurationAndReason(text);
      if (fb.minutes !== null) minutes = fb.minutes;
      if (reason === "unspecified" && fb.reason !== "unspecified") reason = fb.reason;
    }
    console.log("[StreetIQ] handleDelayDetails", { text, knownMinutes, aiMinutes, finalMinutes: minutes, reason, pendingFlags: { reasonAsked: pending.reasonAsked, minutesAsked: pending.minutesAsked } });
    // Catch a reason the keyword list missed (e.g. "car broke down").
    if (reason === "unspecified") {
      const lower = text.toLowerCase();
      if (lower.includes("broke down") || lower.includes("breakdown")) reason = "vehicle broke down";
      else if (lower.includes("engine")) reason = "engine trouble";
      else if (lower.includes("battery")) reason = "battery issue";
      else if (lower.includes("park")) reason = "parking trouble";
    }
    // If we still don't know the duration, re-ask instead of guessing.
    if (minutes === null) {
      const reasonKnown = reason !== "unspecified";
      const q = `How many minutes will ${pending.parcelLabel} be delayed?`;
      dispatch({
        type: "SET_PENDING_FOLLOWUP",
        payload: { type: "delay_details", parcelId: pending.parcelId, parcelLabel: pending.parcelLabel, question: q, knownMinutes: null, knownReason: reasonKnown ? reason : null, reasonAsked: pending.reasonAsked || reasonKnown, minutesAsked: true },
      });
      dispatch({ type: "ADD_EVENT", payload: `Otto: re-asking — duration not captured for ${pending.parcelId}` });
      await playTtsAlert(`I didn't catch the number of minutes — how long will ${pending.parcelLabel} be delayed?`);
      return;
    }
    // Duration is known but no reason yet — ask once for the reason.
    if (reason === "unspecified" && !pending.reasonAsked) {
      const q = `What's the reason for the delay on ${pending.parcelLabel}?`;
      dispatch({
        type: "SET_PENDING_FOLLOWUP",
        payload: { type: "delay_details", parcelId: pending.parcelId, parcelLabel: pending.parcelLabel, question: q, knownMinutes: minutes, knownReason: null, reasonAsked: true, minutesAsked: pending.minutesAsked || true },
      });
      dispatch({ type: "ADD_EVENT", payload: `Otto: follow-up — asking for reason on ${pending.parcelId}` });
      await playTtsAlert(`Got it, ${minutes} minutes. What's the reason for the delay?`);
      return;
    }
    // We've already asked for the reason once — accept whatever we have (use the
    // raw reply as a free-form reason, or fall back to "unspecified").
    if (reason === "unspecified" && pending.reasonAsked) {
      const trimmed = text.trim();
      if (trimmed.length > 0) reason = trimmed.slice(0, 60);
    }
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_details", entity: `+${minutes}min · ${reason}` } });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: pending.parcelId, minutes, reason } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: ${pending.parcelId} delayed +${minutes}min — ${reason}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    await playTtsAlert("OK, thanks. I'll send it to the back office.");
  };

  const handleAheadDetails = async (text: string, pending: Extract<PendingFollowUp, { type: "ahead_details" }>) => {
    const knownMinutes = pending.knownMinutes ?? null;
    let minutes: number | null = knownMinutes;
    let reason = pending.knownReason ?? "running ahead";
    let aiMinutes: number | null = null;
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mode: "delay_details" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Number.isFinite(data.minutes)) {
          aiMinutes = Math.max(1, Math.round(data.minutes));
          minutes = aiMinutes;
        }
        if (typeof data.reason === "string" && data.reason.length > 0 && data.reason !== "unspecified") reason = data.reason;
      } else {
        const fb = parseDurationAndReason(text);
        if (fb.minutes !== null) minutes = fb.minutes;
        if (fb.reason !== "unspecified") reason = fb.reason;
      }
    } catch {
      const fb = parseDurationAndReason(text);
      if (fb.minutes !== null) minutes = fb.minutes;
      if (fb.reason !== "unspecified") reason = fb.reason;
    }
    if (minutes === null) {
      const fb = parseDurationAndReason(text);
      if (fb.minutes !== null) minutes = fb.minutes;
      if ((reason === "running ahead" || reason === "unspecified") && fb.reason !== "unspecified") reason = fb.reason;
    }
    console.log("[StreetIQ] handleAheadDetails", { text, knownMinutes, aiMinutes, finalMinutes: minutes, reason, pendingFlags: { reasonAsked: pending.reasonAsked, minutesAsked: pending.minutesAsked } });
    if (reason === "running ahead" || reason === "unspecified") {
      const lower = text.toLowerCase();
      if (lower.includes("light traffic") || lower.includes("no traffic")) reason = "light traffic";
      else if (lower.includes("quick") || lower.includes("fast")) reason = "quick stops";
      else if (lower.includes("shortcut")) reason = "took a shortcut";
      else if (text.trim().length > 0 && reason === "unspecified") reason = text.trim().slice(0, 60);
    }
    if (minutes === null) {
      const reasonKnown = reason !== "running ahead" && reason !== "unspecified";
      dispatch({
        type: "SET_PENDING_FOLLOWUP",
        payload: { type: "ahead_details", parcelId: pending.parcelId, parcelLabel: pending.parcelLabel, question: `How many minutes ahead are you on ${pending.parcelLabel}?`, knownMinutes: null, knownReason: reasonKnown ? reason : null, reasonAsked: pending.reasonAsked || reasonKnown, minutesAsked: true },
      });
      dispatch({ type: "ADD_EVENT", payload: `Otto: re-asking — duration not captured for ${pending.parcelId}` });
      await playTtsAlert(`I didn't catch the number of minutes — how far ahead are you on ${pending.parcelLabel}?`);
      return;
    }
    // Duration is known but no reason yet — ask once for the reason.
    if ((reason === "running ahead" || reason === "unspecified") && !pending.reasonAsked) {
      const q = `What's helping you run ahead on ${pending.parcelLabel}?`;
      dispatch({
        type: "SET_PENDING_FOLLOWUP",
        payload: { type: "ahead_details", parcelId: pending.parcelId, parcelLabel: pending.parcelLabel, question: q, knownMinutes: minutes, knownReason: null, reasonAsked: true, minutesAsked: pending.minutesAsked || true },
      });
      dispatch({ type: "ADD_EVENT", payload: `Otto: follow-up — asking for reason on ${pending.parcelId}` });
      await playTtsAlert(`Nice, ${minutes} minutes ahead. What's helping you run ahead?`);
      return;
    }
    if ((reason === "running ahead" || reason === "unspecified") && pending.reasonAsked) {
      const trimmed = text.trim();
      if (trimmed.length > 0) reason = trimmed.slice(0, 60);
    }
    dispatch({ type: "SET_INTENT", payload: { intent: "ahead_details", entity: `−${minutes}min · ${reason}` } });
    dispatch({ type: "APPLY_AHEAD", payload: { parcelId: pending.parcelId, minutes, reason } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: ${pending.parcelId} ahead −${minutes}min — ${reason}` });
    dispatch({ type: "CLEAR_PENDING_FOLLOWUP" });
    await playTtsAlert("Great, thanks. I'll let dispatch know you're ahead of schedule.");
  };

  // Robust local parser used as fallback when the AI is unavailable or returns
  // null minutes. Recognizes bare numbers ("12"), units ("12 minutes", "2 hours"),
  // single number words ("twelve"), tens ("twenty"), and compound forms
  // ("twenty-five", "forty five"), plus "an hour" / "half an hour".
  const parseDurationAndReason = (text: string): { minutes: number | null; reason: string } => {
    const lower = text.toLowerCase().trim();
    const ones: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
      ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    };
    const tens: Record<string, number> = {
      twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
    };
    let minutes: number | null = null;
    // 1) "<num> hour(s)" → minutes
    const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/);
    if (hourMatch) minutes = Math.max(1, Math.round(parseFloat(hourMatch[1]) * 60));
    // 2) "<num> minute(s)/min(s)"
    if (minutes === null) {
      const minMatch = lower.match(/(\d+)\s*(?:minute|min)s?\b/);
      if (minMatch) minutes = Math.max(1, parseInt(minMatch[1], 10));
    }
    // 3) "an hour" / "half an hour" / "a half hour" / "quarter of an hour"
    if (minutes === null) {
      if (/\bhalf an hour\b/.test(lower) || /\ba half hour\b/.test(lower) || /\bhalf hour\b/.test(lower)) minutes = 30;
      else if (/\b(an|one)\s+hour\b/.test(lower)) minutes = 60;
      else if (/\bquarter\s+(?:of\s+)?an?\s+hour\b/.test(lower)) minutes = 15;
    }
    // 4) Compound number word "<tens>[-\s]<ones>" e.g. "twenty-five"
    if (minutes === null) {
      const compMatch = lower.match(/\b(twenty|thirty|forty|fourty|fifty|sixty)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/);
      if (compMatch) minutes = tens[compMatch[1]] + ones[compMatch[2]];
    }
    // 5) Single number word
    if (minutes === null) {
      const wordMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty)\b/);
      if (wordMatch) minutes = ones[wordMatch[1]] ?? tens[wordMatch[1]] ?? null;
    }
    // 6) Bare integer ("12", "about 12") — last so units take precedence.
    if (minutes === null) {
      const bareMatch = lower.match(/\b(\d{1,3})\b/);
      if (bareMatch) {
        const n = parseInt(bareMatch[1], 10);
        if (n >= 1 && n <= 240) minutes = n;
      }
    }
    let reason = "unspecified";
    if (lower.includes("traffic")) reason = lower.includes("light") || lower.includes("no traffic") ? "light traffic" : "heavy traffic";
    else if (lower.includes("tire") || lower.includes("flat")) reason = "flat tire";
    else if (lower.includes("accident")) reason = "accident on route";
    else if (lower.includes("customer")) reason = "long customer interaction";
    else if (lower.includes("broke down") || lower.includes("breakdown")) reason = "vehicle broke down";
    else if (lower.includes("engine")) reason = "engine trouble";
    else if (lower.includes("battery")) reason = "battery issue";
    else if (lower.includes("park")) reason = "parking trouble";
    else if (lower.includes("shortcut")) reason = "took a shortcut";
    return { minutes, reason };
  };

  const askForClarification = (heard: string) => {
    const snippet = heard.trim().slice(0, 60);
    dispatch({ type: "ADD_EVENT", payload: `Driver A: unclear input${snippet ? ` ("${snippet}${heard.length > 60 ? "…" : ""}")` : ""}` });
    dispatch({ type: "SET_INTENT", payload: { intent: "clarify_needed", entity: snippet } });
    const prompt = snippet.length === 0
      ? "Sorry, I didn't catch that. Could you repeat?"
      : "Sorry, I didn't quite get that. Could you say it again, or give me a bit more detail?";
    playTtsAlert(prompt);
  };

  const classifyTranscript = async (text: string) => {
    const trimmed = text.trim();
    // Very short or empty transcripts → ask to repeat instead of guessing.
    if (trimmed.length === 0 || trimmed.split(/\s+/).length < 2) {
      askForClarification(trimmed);
      return;
    }
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const confidence = typeof data.confidence === "number" ? data.confidence : 1;
        // Low-confidence or unclassifiable → ask the driver to clarify.
        if (data.intent === "general" || confidence < 0.5) {
          askForClarification(text);
          return;
        }
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
    else askForClarification(text);
  };

  const aParcel =
    state.parcels.find((p) => p.id === state.currentParcelId) ??
    state.parcels.find((p) => p.driver === "Driver A" && (p.status === "pending" || p.status === "delayed" || p.status === "early"));
  // While a continuous session is active, keep the "listening" affordance
  // between turns so the waveform doesn't drop to standby during restart gaps.
  const mode: "standby" | "listening" | "speaking" = state.isSpeaking
    ? "speaking"
    : state.isListening || sessionActive
      ? "listening"
      : "standby";
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
          style={{ marginTop: 16 }}
        >
          {state.pendingFollowUp.type === "inbound_alert" ? (
            <div style={{ display: "flex", gap: 8 }}>
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
                style={{ fontFamily: FONT_MONO, fontSize: 11, color: SI.accentDeep, letterSpacing: "0.08em" }}
              >
                ◌ Opening map and parking hotspots…
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
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
      <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {/* Continuous-conversation toggle */}
        <button
          data-testid="btn-continuous-toggle"
          onClick={() => dispatch({ type: "SET_CONTINUOUS_MODE", payload: !state.continuousMode })}
          aria-pressed={state.continuousMode}
          aria-label={`Continuous conversation ${state.continuousMode ? "on" : "off"}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 10px 5px 6px",
            borderRadius: 999,
            background: state.continuousMode ? SI.accentWash : SI.surface,
            border: `1px solid ${state.continuousMode ? SI.accent : SI.hair}`,
            cursor: "pointer",
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: state.continuousMode ? SI.accentDeep : SI.inkSoft,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 26,
              height: 14,
              borderRadius: 999,
              background: state.continuousMode ? SI.accentDeep : SI.hair,
              position: "relative",
              transition: "background .2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: state.continuousMode ? 14 : 2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#fff",
                transition: "left .2s",
              }}
            />
          </span>
          <span>Continuous · {state.continuousMode ? "ON" : "OFF"}</span>
        </button>
        <SIWave mode={mode} />
        <button
          data-testid="btn-mic"
          onClick={handleMicClick}
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: sessionActive
              ? SI.rustDeep
              : mode === "listening"
                ? SI.accentDeep
                : mode === "speaking"
                  ? SI.accent
                  : SI.surface,
            border: `1px solid ${sessionActive ? SI.rustDeep : mode === "standby" ? SI.hair : SI.accent}`,
            color: mode === "standby" && !sessionActive ? SI.accentDeep : "#fff",
            fontFamily: FONT_HEAD,
            fontSize: 14,
            fontStyle: "italic",
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "all .25s",
            boxShadow: mode !== "standby" || sessionActive ? `0 0 0 8px ${SI.accentWash}` : "none",
          }}
        >
          {sessionActive
            ? mode === "speaking"
              ? "otto"
              : "end"
            : mode === "listening"
              ? "● rec"
              : mode === "speaking"
                ? "otto"
                : "speak"}
        </button>
        <div style={{ minHeight: 56, textAlign: "center", maxWidth: 320 }}>
          {state.spokenCaption ? (
            <div
              data-testid="spoken-caption"
              style={{
                fontFamily: FONT_HEAD,
                fontStyle: "italic",
                fontSize: 14,
                color: SI.accentDeep,
                lineHeight: 1.4,
              }}
            >
              “{state.spokenCaption}”
            </div>
          ) : state.transcript ? (
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
// BackOfficeWave — red waveform variant for Back Office Otto
// ============================================================
function BackOfficeWave({ mode }: { mode: "standby" | "listening" | "speaking" }) {
  const heights = [10, 16, 22, 30, 22, 14, 24, 32, 26, 16, 10, 18, 28, 22, 14, 20, 30, 24, 16, 22, 14, 10];
  const active = mode !== "standby";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 36 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: SI.rustDeep,
            height: h,
            opacity: active ? 0.95 : 0.28,
            animation: active ? `si-bar 0.8s ease-in-out ${i * 0.04}s infinite alternate` : "none",
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// BackOfficeStrip — Otto's dispatcher cockpit at the top of PANEL 02
// ============================================================
function BackOfficeStrip() {
  const { state, dispatch, playBackOfficeTts, cancelBackOfficeTts, acceptBackOfficeRec, dismissBackOfficeRec } = useDemo();
  const rec = state.backOfficeRecommendation;
  const hasRec = !!rec;
  const cardOpen = state.backOfficeCardOpen;
  const showBell = state.backOfficeNotification;
  const mode: "standby" | "listening" | "speaking" = state.backOfficeIsSpeaking
    ? "speaking"
    : state.backOfficeIsListening
      ? "listening"
      : "standby";

  const status = state.backOfficeIsSpeaking
    ? "Speaking…"
    : state.backOfficeIsListening
      ? "Listening…"
      : hasRec
        ? showBell
          ? "New recommendation available"
          : "Recommendation ready — review below"
        : "Idle · monitoring plan";

  const handlePlayClick = async () => {
    if (state.backOfficeIsSpeaking) {
      // Interrupt current narration — cancels both /api/tts audio and speechSynthesis.
      cancelBackOfficeTts();
      return;
    }
    if (hasRec) {
      dispatch({ type: "OPEN_BACK_OFFICE_CARD" }); // opens card and clears bell
      playBackOfficeTts(rec!.narration);
    } else {
      playBackOfficeTts("Dispatch — no rebalancing needed right now. The plan looks healthy.");
    }
  };

  const handleMicClick = () => {
    if (state.backOfficeIsListening) {
      dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { listening: false } });
      return;
    }
    // Mic is a placeholder for future press-to-talk; flash listening state
    // and acknowledge so the dispatcher gets feedback.
    dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { listening: true } });
    setTimeout(() => {
      dispatch({ type: "SET_BACK_OFFICE_VOICE_STATE", payload: { listening: false } });
    }, 1200);
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${SI.hair}`,
        background: hasRec ? SI.rustWash : SI.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* PLAY button — bell badge appears when there's a fresh recommendation */}
        <button
          data-testid="btn-back-office-play"
          onClick={handlePlayClick}
          aria-label={state.backOfficeIsSpeaking ? "Stop Back Office Otto" : "Play Back Office Otto"}
          style={{
            position: "relative",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: state.backOfficeIsSpeaking ? SI.rustDeep : showBell ? SI.rustWash : SI.surfaceUp,
            border: `2px solid ${SI.rustDeep}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: showBell ? `0 0 0 4px ${SI.rustWash}` : "none",
            animation: showBell ? "si-pulse 1.6s ease-in-out infinite" : "none",
            transition: "all .2s",
          }}
        >
          {state.backOfficeIsSpeaking ? (
            // Stop (square) icon
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            // AI sparkle icon
            <svg width="20" height="20" viewBox="0 0 24 24" fill={SI.rustDeep}>
              <path d="M12 2.5l1.7 4.8 4.8 1.7-4.8 1.7L12 15.5l-1.7-4.8L5.5 9l4.8-1.7L12 2.5z" />
              <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
            </svg>
          )}
          {showBell && !state.backOfficeIsSpeaking && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: SI.rustDeep,
                color: "#fff",
                fontSize: 9,
                fontFamily: FONT_MONO,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #fff",
                animation: "si-pulse 1.2s ease-in-out infinite",
              }}
            >
              !
            </span>
          )}
        </button>
        {/* MIC button — separate input channel */}
        <button
          data-testid="btn-back-office-mic"
          onClick={handleMicClick}
          aria-label="Back Office Otto microphone"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: state.backOfficeIsListening ? SI.rustWash : SI.surfaceUp,
            border: `2px solid ${SI.rustDeep}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all .2s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SI.rustDeep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>
        <BackOfficeWave mode={mode} />
        <div style={{ flex: 1, minWidth: 0, marginLeft: "auto", textAlign: "right" }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              color: SI.rustDeep,
              letterSpacing: "0.18em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Back Office Otto
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: hasRec ? SI.rustDeep : SI.inkSoft,
              fontWeight: hasRec ? 600 : 400,
              lineHeight: 1.3,
              marginTop: 2,
            }}
          >
            {status}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hasRec && cardOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            data-testid="back-office-rec-card"
            style={{
              marginTop: 10,
              padding: "12px 14px",
              background: SI.surfaceUp,
              border: `1px solid ${SI.hair}`,
              borderLeft: `4px solid ${SI.rustDeep}`,
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                color: SI.rustDeep,
                letterSpacing: "0.18em",
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Otto · rebalancing recommendation
            </div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 13, color: SI.ink, lineHeight: 1.4 }}>
              {rec!.summary}
            </div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {rec!.parcelIdsToMove.map((id) => {
                const p = state.parcels.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <span
                    key={id}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color: SI.rustDeep,
                      background: SI.rustWash,
                      border: `1px solid ${SI.rustDeep}`,
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {p.id} · {p.address} → Tomorrow
                  </span>
                );
              })}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                data-testid="btn-back-office-accept"
                onClick={acceptBackOfficeRec}
                style={{
                  flex: 1,
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 600,
                  background: SI.rustDeep,
                  color: "#fff",
                  border: "none",
                  padding: "7px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Accept rebalance
              </button>
              <button
                data-testid="btn-back-office-dismiss"
                onClick={dismissBackOfficeRec}
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
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Panel 03 — Dispatch (parcels + system log)
// ============================================================
function PanelThree() {
  const { state, dispatch } = useDemo();

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
      case "early":
        return { bg: SI.accentWash, color: SI.accentDeep };
      case "failed":
        return { bg: SI.rustWash, color: SI.rustDeep };
      default:
        return { bg: SI.surface, color: SI.inkSoft };
    }
  };

  const driverASections = state.parcels.filter((p) => p.driver === "Driver A");
  const driverBSections = state.parcels.filter((p) => p.driver === "Driver B");
  const showDriverBSection = driverBSections.length > 0;

  const renderHeader = () => (
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
  );

  const renderRow = (p: Parcel) => {
    const dc = driverChip(p.driver);
    const sc = statusChip(p.status);
    const isCurrent = p.id === state.currentParcelId;
    const isSelectable = p.driver === "Driver A";
    return (
      <tr
        key={p.id}
        data-testid={`parcel-row-${p.id}`}
        onClick={isSelectable ? () => dispatch({ type: "SET_CURRENT_PARCEL", payload: { parcelId: p.id } }) : undefined}
        style={{
          borderBottom: `1px solid ${SI.hairSoft}`,
          cursor: isSelectable ? "pointer" : "default",
          background: isCurrent ? SI.accentWash : "transparent",
          boxShadow: isCurrent ? `inset 3px 0 0 ${SI.accentDeep}` : "none",
        }}>
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
  };

  const driverHeader = (label: string, count: number, accent: string, accentWash: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
        marginTop: 8,
        marginBottom: 6,
        borderLeft: `3px solid ${accent}`,
        background: accentWash,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: accent,
          letterSpacing: "0.18em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: accent,
          fontWeight: 600,
          letterSpacing: "0.08em",
        }}
      >
        {count} {count === 1 ? "stop" : "stops"}
      </span>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <BackOfficeStrip />
      {/* Parcels — split by driver */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 16px" }}>
        {driverHeader("Driver A", driverASections.length, SI.accentDeep, SI.accentWash)}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {renderHeader()}
          <tbody>{driverASections.map(renderRow)}</tbody>
        </table>
        {showDriverBSection && (
          <>
            {driverHeader("Driver B", driverBSections.length, SI.ink2Deep, SI.ink2Wash)}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              {renderHeader()}
              <tbody>{driverBSections.map(renderRow)}</tbody>
            </table>
          </>
        )}
      </div>

    </div>
  );
}

// ============================================================
// SystemLog — shared live event strip (rendered under Panel 03)
// ============================================================
function SystemLog() {
  const { state } = useDemo();
  return (
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
              animation: "si-pulse 1.6s ease-in-out infinite",
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
  );
}

// ============================================================
// Panel 04 — Proactive Copilot (Driver B → Driver A scenario triggers)
// ============================================================
function PanelFour() {
  const { state, dispatch, processIntent, triggerInboundAlert } = useDemo();
  const [customMsg, setCustomMsg] = useState("");
  const [clarification, setClarification] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingAlert = state.pendingFollowUp?.type === "inbound_alert" ? state.pendingFollowUp : null;

  // Clear any clarification hint when the user starts editing again.
  useEffect(() => {
    if (clarification) setClarification(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customMsg]);

  const sendCustom = async () => {
    if (!customMsg.trim() || pendingAlert || busy) return;
    const text = customMsg.trim();
    setBusy(true);
    setClarification(null);

    let data:
      | { intent?: string; entity?: string; parcelRef?: string; minutes?: number; reason?: string; confidence?: number }
      | null = null;
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (res.ok) data = await res.json();
    } catch {
      /* network error */
    }
    setBusy(false);

    if (!data) {
      setClarification("Couldn't reach Otto. Please try again.");
      return;
    }

    const conf = typeof data.confidence === "number" ? data.confidence : 1;

    // Unclear → ask Driver B for more detail inline (don't bother Driver A yet).
    if (!data.intent || data.intent === "general" || conf < 0.5) {
      setClarification(
        "I'm not sure what to do with that. Mention which delivery (parcel number or street) and what's happening — for example: closed, delayed by 15 min, parking, ahead, or delivered."
      );
      return;
    }

    // Need-more-info checks for delay / ahead reports.
    if (data.intent === "delay_reported" || data.intent === "ahead_reported") {
      const hasRef = typeof data.parcelRef === "string" && data.parcelRef.trim().length > 0;
      const hasMins = typeof data.minutes === "number";
      const hasReason = typeof data.reason === "string" && data.reason.length > 0;
      if (!hasRef) {
        setClarification("Which delivery? Mention the parcel number, the street, or say 'next'.");
        return;
      }
      if (!hasMins) {
        setClarification("How many minutes? Add a duration like '15 minutes' or 'half an hour'.");
        return;
      }
      if (!hasReason) {
        setClarification(data.intent === "delay_reported" ? "What's the cause of the delay?" : "What's helping you run ahead?");
        return;
      }
    }

    // Clear, actionable message → log it from Driver B, apply to Panel 02 plan,
    // and have Otto narrate the change to Driver A.
    dispatch({ type: "ADD_EVENT", payload: `Driver B → Dispatch: ${text}` });
    const extras: DelayExtras = {};
    if (typeof data.parcelRef === "string") extras.parcelRef = data.parcelRef;
    if (typeof data.minutes === "number") extras.minutes = data.minutes;
    if (typeof data.reason === "string" && data.reason.length > 0) extras.reason = data.reason;
    processIntent(data.intent, data.entity ?? "", extras);
    setCustomMsg("");
  };

  const showProactiveCard = state.driverBAlertVisible;
  const acceptedReroute = state.driverBRerouteAccepted === true;

  const toneColor = (t: "amber" | "rust" | "accent") =>
    t === "amber"
      ? { bar: SI.amberDeep, wash: SI.amberWash, deep: SI.amberDeep }
      : t === "rust"
        ? { bar: SI.rustDeep, wash: SI.rustWash, deep: SI.rustDeep }
        : { bar: SI.accentDeep, wash: SI.accentWash, deep: SI.accentDeep };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 22px 22px", display: "flex", flexDirection: "column" }}>
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


      {/* Custom Driver B message — ad-hoc inbound alert */}
      <div
        style={{
          marginTop: 12,
          marginBottom: 12,
          padding: "10px 12px",
          background: SI.surfaceUp,
          border: `1px solid ${SI.hair}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: SI.ink2Deep,
            letterSpacing: "0.18em",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          CUSTOM MESSAGE FROM DRIVER B
        </div>
        <textarea
          value={customMsg}
          onChange={(e) => setCustomMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              sendCustom();
            }
          }}
          placeholder="Type a message to back office…"
          disabled={!!pendingAlert || busy}
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: FONT_BODY,
            fontSize: 12,
            color: SI.ink,
            background: SI.surface,
            border: `1px solid ${clarification ? SI.amberDeep : SI.hair}`,
            borderRadius: 6,
            padding: "6px 8px",
            resize: "vertical",
            outline: "none",
          }}
        />
        {clarification && (
          <div
            data-testid="driver-b-clarification"
            style={{
              marginTop: 6,
              padding: "6px 8px",
              background: SI.amberWash,
              border: `1px solid ${SI.amberDeep}`,
              borderRadius: 6,
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: SI.amberDeep,
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 700, marginRight: 4 }}>Otto:</span>
            {clarification}
          </div>
        )}
        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={sendCustom}
            disabled={!customMsg.trim() || !!pendingAlert || busy}
            data-testid="btn-driver-b-custom"
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              fontWeight: 600,
              background: customMsg.trim() && !pendingAlert && !busy ? SI.ink2Deep : SI.hair,
              color: customMsg.trim() && !pendingAlert && !busy ? "#fff" : SI.inkFaint,
              border: "none",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: customMsg.trim() && !pendingAlert && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            </button>
          );
        })}
      </div>
      </div>
      <SystemLog />
    </div>
  );
}
