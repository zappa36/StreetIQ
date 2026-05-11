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
  | { type: "delay_details"; parcelId: string; parcelLabel: string; question: string; knownMinutes: number | null; knownReason: string | null }
  | { type: "ahead_details"; parcelId: string; parcelLabel: string; question: string; knownMinutes: number | null; knownReason: string | null }
  | { type: "confirm_navigation"; question: string; contextLabel: string }
  | { type: "inbound_alert"; scenarioId: DriverBScenarioId | null; summary: string; fullMessage: string; question: string };

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
  spokenCaption: string;
  isRunningDemo: boolean;
  scenarioIdx: number;
  awaitingScenarioStart: boolean;
  currentParcelId: string | null;
  continuousMode: boolean;
  resetSignal: number;
  ttsInFlight: number;
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
      "Driver A reports Maple Street is closed. StreetIQ relays the closure to Driver B and offers them an alternate route.",
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
        {index && (
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
        )}
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
  onRunDemo: () => void;
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
    dispatch({ type: "SET_TRANSCRIPT", payload: "the road is closed on Maple Street" });
    dispatch({ type: "SET_INTENT", payload: { intent: "road_closed", entity: "Maple Street" } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: road_closed "Maple Street"` });
    dispatch({ type: "ADD_EVENT", payload: `REROUTE ALERT: Generating alternate routes...` });
    dispatch({ type: "ROAD_CLOSED_IMPACT" });

    await wait(1400);
    if (cancelled(runId)) return;
    dispatch({ type: "SET_B_ALERT_VISIBLE", payload: true });
    await playTtsAlert("Driver B — a colleague just reported Maple Street is closed. Want me to show an alternate route?");
    if (cancelled(runId)) return;

    await wait(1200);
    if (cancelled(runId)) return;
    dispatch({ type: "ADD_EVENT", payload: `Driver B accepted reroute for P004` });
    dispatch({ type: "DRIVER_B_ACCEPT_REROUTE" });
  };

  const SCENARIO_RUNNERS: Array<(runId: number) => Promise<void>> = [
    runScenarioNavigation,
    runScenarioDelay,
    runScenarioReroute,
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

  const handleRunDemo = () => {
    // Bump runId so any in-flight runner from a previous run becomes cancelled.
    demoRunIdRef.current += 1;
    clearDemoTimers();
    flushWaits();
    scriptedDemoActiveRef.current = true;
    dispatch({ type: "RESET_DEMO" });
    dispatch({ type: "SET_RUNNING_DEMO", payload: true });
    queueScenario(0);
  };

  const handleStartScenario = async () => {
    const idx = stateRef.current.scenarioIdx;
    if (idx < 0 || idx >= SCENARIO_RUNNERS.length) return;
    const myRunId = demoRunIdRef.current;
    dispatch({ type: "SET_SCENARIO_GATE", payload: { idx, awaiting: false } });
    try {
      await SCENARIO_RUNNERS[idx](myRunId);
    } finally {
      // Only schedule the next scenario if this run is still the active one.
      if (myRunId === demoRunIdRef.current) {
        await wait(600);
        if (myRunId === demoRunIdRef.current) {
          queueScenario(idx + 1);
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
    clearDemoTimers();
    flushWaits();
    try { window.speechSynthesis?.cancel(); } catch {}
    dispatch({ type: "SET_SPEAKING", payload: false });
    dispatch({ type: "SET_RUNNING_DEMO", payload: false });
    dispatch({ type: "SET_SCENARIO_GATE", payload: { idx: -1, awaiting: false } });
    dispatch({ type: "ADD_EVENT", payload: `Scripted demo stopped by user` });
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
    <DemoContext.Provider value={{ state, dispatch, processIntent, triggerInboundAlert, triggerCustomInboundAlert, playTtsAlert }}>
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
          <PanelShell index="02" title="Dispatch" sub="6 stops · Driver A" tone="rust" bg={SI.bg}>
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
    let minutes = pending.knownMinutes ?? 10;
    let reason = pending.knownReason ?? "unspecified";
    // Only treat the AI/keyword duration as authoritative when the driver's
    // follow-up actually mentions a duration — otherwise we'd clobber the
    // minutes captured on the first turn (e.g. "5 min") with the AI default.
    const mentionsDuration = /\b(\d+|an|a|half|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty)\s*(?:minute|min|hour|hr)\b/i.test(text)
      || /\bhalf an hour\b/i.test(text);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mode: "delay_details" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (mentionsDuration && Number.isFinite(data.minutes)) minutes = Math.max(1, Math.round(data.minutes));
        if (typeof data.reason === "string" && data.reason.length > 0 && data.reason !== "unspecified") reason = data.reason;
      } else {
        const fb = parseDelayKeywords(text);
        if (mentionsDuration) minutes = fb.minutes;
        if (fb.reason !== "unspecified") reason = fb.reason;
      }
    } catch {
      const fb = parseDelayKeywords(text);
      if (mentionsDuration) minutes = fb.minutes;
      if (fb.reason !== "unspecified") reason = fb.reason;
    }
    // Catch a reason the keyword list missed (e.g. "car broke down") so we
    // don't fall back to "unspecified" when the driver clearly stated one.
    if (reason === "unspecified") {
      const lower = text.toLowerCase();
      if (lower.includes("broke down") || lower.includes("breakdown")) reason = "vehicle broke down";
      else if (lower.includes("engine")) reason = "engine trouble";
      else if (lower.includes("battery")) reason = "battery issue";
      else if (lower.includes("park")) reason = "parking trouble";
      else if (text.trim().length > 0) reason = text.trim().slice(0, 60);
    }
    dispatch({ type: "SET_INTENT", payload: { intent: "delay_details", entity: `+${minutes}min · ${reason}` } });
    dispatch({ type: "APPLY_DELAY", payload: { parcelId: pending.parcelId, minutes, reason } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: ${pending.parcelId} delayed +${minutes}min — ${reason}` });
    await playTtsAlert("OK, thanks. I'll send it to the back office.");
  };

  const handleAheadDetails = async (text: string, pending: Extract<PendingFollowUp, { type: "ahead_details" }>) => {
    let minutes = pending.knownMinutes ?? 10;
    let reason = pending.knownReason ?? "running ahead";
    const mentionsDuration = /\b(\d+|an|a|half|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty)\s*(?:minute|min|hour|hr)\b/i.test(text)
      || /\bhalf an hour\b/i.test(text);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, mode: "delay_details" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (mentionsDuration && Number.isFinite(data.minutes)) minutes = Math.max(1, Math.round(data.minutes));
        if (typeof data.reason === "string" && data.reason.length > 0 && data.reason !== "unspecified") reason = data.reason;
      } else {
        const fb = parseDelayKeywords(text);
        if (mentionsDuration) minutes = fb.minutes;
        if (fb.reason !== "unspecified") reason = fb.reason;
      }
    } catch {
      const fb = parseDelayKeywords(text);
      if (mentionsDuration) minutes = fb.minutes;
      if (fb.reason !== "unspecified") reason = fb.reason;
    }
    if (reason === "running ahead" || reason === "unspecified") {
      const lower = text.toLowerCase();
      if (lower.includes("light traffic") || lower.includes("no traffic")) reason = "light traffic";
      else if (lower.includes("quick") || lower.includes("fast")) reason = "quick stops";
      else if (lower.includes("shortcut")) reason = "took a shortcut";
      else if (text.trim().length > 0 && reason === "unspecified") reason = text.trim().slice(0, 60);
    }
    dispatch({ type: "SET_INTENT", payload: { intent: "ahead_details", entity: `−${minutes}min · ${reason}` } });
    dispatch({ type: "APPLY_AHEAD", payload: { parcelId: pending.parcelId, minutes, reason } });
    dispatch({ type: "ADD_EVENT", payload: `Driver A: ${pending.parcelId} ahead −${minutes}min — ${reason}` });
    await playTtsAlert("Great, thanks. I'll let dispatch know you're ahead of schedule.");
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
    const isSelectable = p.driver === "Driver A" && p.status !== "delivered";
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
  const { state, dispatch, triggerInboundAlert, triggerCustomInboundAlert } = useDemo();
  const [customMsg, setCustomMsg] = useState("");
  const pendingAlert = state.pendingFollowUp?.type === "inbound_alert" ? state.pendingFollowUp : null;
  const sendCustom = () => {
    if (!customMsg.trim() || pendingAlert) return;
    triggerCustomInboundAlert(customMsg);
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
          disabled={!!pendingAlert}
          rows={2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: FONT_BODY,
            fontSize: 12,
            color: SI.ink,
            background: SI.surface,
            border: `1px solid ${SI.hair}`,
            borderRadius: 6,
            padding: "6px 8px",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={sendCustom}
            disabled={!customMsg.trim() || !!pendingAlert}
            data-testid="btn-driver-b-custom"
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              fontWeight: 600,
              background: customMsg.trim() && !pendingAlert ? SI.ink2Deep : SI.hair,
              color: customMsg.trim() && !pendingAlert ? "#fff" : SI.inkFaint,
              border: "none",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: customMsg.trim() && !pendingAlert ? "pointer" : "not-allowed",
            }}
          >
            Send
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
