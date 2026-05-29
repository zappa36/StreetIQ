# Brief: Update Otto's in-cab voice lines to brand kit v2

## What & why

The v2 brand kit adds a load-bearing voice principle: **Otto is a companion, not a supervisor.** Otto helps the driver and never grades or thanks them, and never relays the driver's own behavior back as judgment. A few in-cab Otto lines currently praise or thank the driver, which violates this principle. Reword them so every line reads as a favor done *for* the driver or their colleagues, pointed forward (next stop, colleague, customer) — never as oversight.

Note that praise ("Nice work") and thanks ("OK, thanks") are both forms of evaluation that put Otto in the supervisor seat — the brand kit already prohibits both (Otto "never thanks the user," is "never folksy," and is "an instrument panel, not a chatbot"). Removing them is enforcing existing rules, not adding new strictness.

Dispatch-facing copy (Panel 03 event log, scenario descriptions) is explicitly allowed to keep "behind" / "falling behind" status and is **out of scope**.

## Guardrail: neutral ≠ cold

Removing praise and thanks must **not** make Otto terse, robotic, or mechanical. Keep the warmth — it just comes from a different place. Warmth lives in Otto's *helpfulness and forward framing*, not in approval of the driver.

The canonical model is the existing parking-save line:
> *"Looks like a solid spot — want me to save it for your colleagues?"*

That line is warm, collaborative, and contains zero praise. Every reworded line should pass the same test: would a helpful colleague riding shotgun say this? A colleague offers help and useful information; they don't issue performance verdicts (good or bad).

## Done looks like

* When Driver A parks and a delivery completes, Otto confirms the delivery and offers the parking-spot contribution **without praising the driver** (no "Nice work"). Keep the warm collaborative offer to save the spot for colleagues.
* When all deliveries are complete, Otto closes out **without grading the driver** (no "nice work") — but still warmly, pointed at the driver's benefit (e.g. "you're clear for the day").
* When Driver A reports being ahead of schedule, Otto acknowledges and logs it **without the "Nice." affirmation and without thanking the driver**, and without pointing "you're ahead of schedule" back at them as a verdict. Frame the time **forward** as a useful offer — e.g. surface the slack as an opportunity to prep the next stop or pull up parking.
* The delay-capture confirmation **no longer thanks the driver** ("OK, thanks" reworded to a neutral, forward acknowledgment that confirms dispatch has been notified).
* No remaining in-cab Otto spoken line thanks the driver, praises the driver, or surfaces the driver's own performance as judgment.
* Spoken lines still read naturally aloud (voice-first), stay spare and factual, **and do not drift cold or mechanical** — keep warmth via helpfulness and the colleague/forward framing.
* All lines keep the existing functional content (parcel id, address, minutes, reason, dispatch notification).

## Reference rewrites (illustrative, not mandatory wording)

| Moment | Before (off-brand) | After (companion, warm, forward) |
|---|---|---|
| Park + delivery complete | "Nice work — parcel delivered." | "Parcel one delivered. Looks like a solid spot — want me to save it for your colleagues?" |
| All stops complete | "Nice work, that's everything." | "That's all six stops complete — you're clear for the day." |
| Ahead of schedule | "Nice, you're ahead of schedule." | "You've got some slack before parcel three — want me to pull up parking nearby?" |
| Delay capture | "OK, thanks — I'll let dispatch know." | "Got it — dispatch knows you'll be ten minutes late to parcel two, 34 Maple Avenue." |

## In-scope vs out-of-scope (quick reference)

**In scope:** all in-cab Otto spoken/written lines directed at the driver (Panel 01 cockpit, Panel 02 map prompts, Panel 04 proactive copilot lines spoken to Driver A/B in their own cabs).

**Out of scope:** Panel 03 dispatch event log, Back Office Otto's dispatch-facing recommendations, and scenario description strings — these are dispatch-facing and may keep performance/status language ("falling behind," etc.).

## Acceptance test

For each reworded line, confirm all four:
1. No thanks, no praise, no driver-performance verdict pointed at the driver.
2. Reads naturally aloud (voice-first); spare and factual.
3. Warm via helpfulness/forward framing — not cold or mechanical (passes the "would a colleague say this?" test).
4. Retains all functional content (ids, addresses, minutes, reasons, dispatch notification).
