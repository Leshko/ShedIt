# ShedIt

A parametric shed planner. Set the footprint and a height for **each wall**, and it
derives the roof, frames the whole building stud by stud, and exports plans you can take
to the lumber yard and the job site.

The headline feature is per-wall heights. Give opposite walls different heights and you
get a **lean-to (skillion)** roof; the two perpendicular walls automatically become
**rake walls** with a stepped stud ladder and a sloping, mitred top plate.

---

## Quick start

```bash
pnpm install
pnpm build
pnpm dev          # API on :3001, web on :3000
```

Open <http://localhost:3000>.

MongoDB is optional. Without it the planner, drawings and every export work normally, and
only the project-saving routes return `503 PERSISTENCE_DISABLED`. To turn saving on:

```bash
docker compose up -d mongo
MONGO_URL=mongodb://localhost:27017/shedit pnpm --filter @shedit/api dev
```

## What it produces

- **3D framing model** — every member as an oriented solid, with per-category toggles.
- **2D drawings** — floor/foundation plan, roof framing plan, four elevations, four wall
  framing elevations, and a cutting diagram per sheet-good layout.
- **Cut list** — per-piece length to the nearest 1/16", with end-cut angles and birdsmouth
  notches.
- **Shopping list** — real board counts from the cutting plan, plus estimated consumables.
- **Exports** — a PDF plan book (including a build sequence), a CSV cut list, and a JSON
  project file that re-imports cleanly.

## How the roof is derived

The roof is a single plane `z = a·x + b·y + c` passing through the **top of every top
plate**. That one convention makes everything else fall out: birdsmouth seat cuts land
exactly on the plane, and a rake wall's top profile is just the plane restricted to that
wall line.

A wall's top edge is level exactly when the plane has no slope along it, so
`front/back level ⟺ a = 0` and `left/right level ⟺ b = 0`. Four level top plates plus one
plane is therefore over-determined — only a flat roof satisfies it. This is not a
limitation of the app; it is what "planar roof" means.

| Wall heights | Result |
|---|---|
| all four equal | **Flat** roof (or **gable**, if you pick that style) |
| front ≠ back | **Lean-to** down the depth; left and right become rake walls |
| left ≠ right | **Lean-to** across the width; front and back become rake walls |
| both pairs differ | **Rejected** — that surface is warped, not planar |

The UI makes the warped case unreachable: as soon as one pair differs, the perpendicular
pair switches to a read-only "low → high" readout. If you *do* want a roof that falls
diagonally, switch to **corner heights** — three corners fix a plane exactly and the
fourth is computed, so that mode can never be invalid. Such a roof is genuinely buildable,
and every rafter is still identical.

Validation errors carry their own remedies as field assignments, so the UI renders a
one-click fix button for each without any per-error code.

## Layout

```
apps/api        NestJS 11 — compute, exports, optional Mongo persistence
apps/web        Next.js 16 App Router — configurator, 3D viewer, drawings
packages/engine Pure TypeScript: geometry → framing → takeoff → optimise → drawings
packages/shared Zod schemas, units, lumber tables, shared types
```

`packages/engine` has no Nest or React dependency. The API, the PDF exporter and the
browser all compute from it, and `computePlan()` is pure and deterministic — no clock, no
randomness, ids derived from structure — so a plan can be cached on a hash of its input.

**One drawing pass, two renderers.** The engine emits an abstract `DrawingIR`; an SVG
renderer feeds the web UI and a pdfkit renderer feeds the plan book. "The PDF matches what
I saw" is a property of the architecture rather than something kept in sync by hand.

Everything is computed in **decimal inches** and formatted as feet-inches-sixteenths for
display.

## Notable engineering choices

- **Best-Fit Decreasing** for the 1D cutting stock problem, with a 1/8" kerf and a
  lookahead that picks the stock length with the least waste per usable inch. Precut studs
  (92-5/8", 104-5/8") are bought whole rather than cut from longer stock.
- **Shelf packing** for 4×8 sheets rather than a denser algorithm like maxrects, because
  every cut has to be edge-to-edge for someone working with a circular saw and a
  straightedge. Panels are never rotated: sheathing must span the framing and T1-11 has
  vertical grooves.
- **Rake studs are dimensioned to their long point** with the bevel angle given, because
  that is how you actually set up the cut. A sloping top plate is `L / cos θ`, not `L`.
- **Cripples above a rake-wall header each get their own length and angle** — the framing
  solver is position-aware rather than emitting N identical pieces.

## Testing

```bash
pnpm test
```

Engine tests cover roof classification for every case, the rake stud ladder and bevels,
plate placement against the roof plane, opening framing, rafter trigonometry, and
optimiser invariants (no piece lost, no stick overfilled, no panels overlapping). The API
suite runs with Mongo absent and includes a parity test asserting the endpoint's output is
byte-identical to calling the engine directly.

## Scope

Flat, lean-to, diagonal-plane and gable roofs over a rectangular footprint. Hip, gambrel
and saltbox roofs, non-rectangular footprints, lofts and metric input are not implemented.

ShedIt produces estimating drawings, not engineered plans. Check local building codes,
permit thresholds, setbacks, frost depth and wind or snow loading before you build.
