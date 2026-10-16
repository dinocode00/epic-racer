# Epic Racer — Master Plan

A free, home-built, couch-multiplayer kart racer. Mario Kart's items and drift-boost feel,
the speed and anti-gravity swagger of the new Star Wars racing game, and clean, readable
modern 3D (with an optional PlayStation 1 retro filter). Tracks are iconic movie scenes. Vehicles are
iconic movie machines. Players race on a TV using iPhones or Xbox controllers as pads.

This document is the single source of truth for the project. It covers the pitch, the
game design, the player/input/TV setup, the technical architecture, the art direction,
the roadmap, and the open decisions.

---

## 1. The best idea (the pitch)

**One laptop, one TV, one QR code, four racers, zero dollars.**

The game is a **web app** that runs in a browser on a laptop plugged into the TV. The laptop
also runs a tiny local server. Anyone in the room scans a QR code with their iPhone, which
opens a touch controller page. Xbox controllers pair to the laptop over Bluetooth and plug
straight into the same game. Nothing is installed on any phone. Nothing is published to any
store. Nothing costs money.

The hook that makes it more than "another kart game" is the **set-piece track**: every track
is a famous movie sequence that *plays out around you while you race*, and the track itself
moves with the scene.

- The **boulder** from *Raiders of the Lost Ark* chases the pack through the tunnel on the final lap.
- The **Paris street folds up** in the *Inception* track and the road continues upside-down
  overhead. Gravity follows the track, so you keep racing on the ceiling.
- The **hotel zero-G corridor** in the same track turns the floor to ice and kills grip.
- A **Nazgûl shadow** sweeps across the hobbit hills; anyone caught in it is slowed and loses their item.

Technically, this is cheap to deliver because the whole racing model is built around a
**track spline with a per-segment "up" vector**. Vehicles are kinematic arcade karts glued to
the track surface, not rigid bodies. Flipping gravity, banking, loops, and the folding city
are all just the spline's up vector changing. That single architectural choice delivers the
"Galactic racing" anti-grav feel and the Inception centrepiece for nearly free.

Everything else follows from three constraints:

| Constraint | Consequence |
|---|---|
| Phones as controllers, no install | Must be a web page served over the home Wi-Fi |
| No cost | Open-source stack only: TypeScript, Three.js, Node, Blender |
| PS1 look | Low-res render target + custom shader; tiny art budget per asset, which is what makes four tracks achievable by one or two people |

---

## 2. Design pillars

1. **Readable at a glance.** Low-poly, high-contrast, iconic silhouettes. If grandma can
   say "that's the Batmobile" from the couch, the art is done.
2. **Scenes, not scenery.** Every track has at least one scripted set piece that changes the
   race. Memorable beats beat pretty textures.
3. **Thirty seconds to racing.** Scan, tap a name, pick a car, go. The lobby is never a chore.
4. **Rubber-band fun over simulation.** Items and catch-up logic keep a 7-year-old and a
   30-year-old in the same race.
5. **Fits in a Friday night.** A full Grand Prix (4 tracks, 3 laps each) is about 15 minutes.

---

## 3. Game design

### 3.1 Modes

| Mode | MVP? | Description |
|---|---|---|
| Single Race | Yes | Pick track, pick vehicles, 3 laps, 1–4 humans + AI to fill 8 slots |
| Grand Prix | Yes | All 4 tracks in sequence, Mario Kart style points (15/12/10/9/8/7/6/5) |
| Time Trial | Later | Solo, ghost of your best lap, no items |
| Battle / Elimination | Stretch | Last-place racer eliminated every 20 seconds |

### 3.2 Racing model (arcade kart)

All vehicles use the same kinematic kart controller, tuned per vehicle. No rigid-body
physics engine; this is deliberate. The kart has:

- **Speed / acceleration / top speed** along the track-tangent direction, with lateral grip.
- **Steer** with speed-dependent turn rate (tighter at low speed).
- **Drift**: hold the drift button while turning to slide; the drift "charges" over time
  (blue → orange → purple sparks) and releases a mini-turbo. Core Mario Kart feel.
- **Boost**: boost pads on track, mini-turbo, slipstream behind another racer for 1.5 s,
  and a start-line boost for a well-timed launch.
- **Hover vs wheels**: hover vehicles (pod racer) float ~0.5 m above the surface with a
  springy bob and slightly looser lateral grip; wheeled vehicles sit on the surface with
  slightly sharper response. Mostly visual, lightly tuned, so balance stays sane.
- **Track-relative gravity**: the kart's "down" is the interpolated spline up-vector, not
  world down. Enables banked turns, wall-rides, loops, and the Inception fold.
- **Off-track**: a Lakitu-style respawn (here a themed "rescue": a Hobbit on a pony, a
  Rolls-Royce from Tanis, Batman's grappling line, a "wake-up kick") after 1.5 s off track
  or when fallen off.
- **Collision**: kart-vs-kart is a soft push with a mass ratio (Batmobile shoves pod racers).
  Kart-vs-wall is a slide with speed loss, never a hard stop.

### 3.3 Catch-up and fairness

- Item distribution weighted by position (leader gets defensive/weak items, last gets strong).
- Mild rubber-banding on AI only. Humans are never slowed down invisibly.
- Optional "Family mode" toggle: auto-accelerate and steering assist for young players.

### 3.4 Items (movie props)

Items are universal (not per-vehicle) so every player learns one set.

| Item | Source | Effect | Analogue |
|---|---|---|---|
| Golden Idol | Raiders | Thrown forward, bounces, knocks out whoever it hits | Green shell |
| Batarang | Batman | Homing projectile at the racer ahead | Red shell |
| Snakes | Raiders ("Why'd it have to be snakes?") | Dropped hazard; drive over it and spin out | Banana |
| The One Ring | LOTR | 5 s invisible and intangible to items, slight speed boost | Boo / Star-lite |
| Totem | Inception | Shield: blocks one hit, trails behind you | Shell shield |
| The Kick | Inception | Shockwave: nearby racers are launched upward and lose 1 s | Blooper-ish area denial |
| Boulder | Raiders | Giant rolling boulder targets 1st place, flattens anyone in the way | Blue shell |
| Podracer Afterburner | Star Wars | 3 s of hard boost, poor steering | Mushroom x3 |
| Nazgûl Shriek | LOTR | Everyone else's screen shakes and they lose their item | Lightning (weakened) |

Item boxes are question-mark crates reskinned as film reels.

### 3.5 Tracks

The brief lists "Tomb of Indiana Jones" and "Raiders of the Lost Ark" as two tracks. Both are
Raiders sequences, so they are split into two *distinct* scenes from the film: the Peruvian
temple opening, and the Egypt sequence (Tanis dig, Well of Souls, truck chase, Ark finale).
If a different Indy film is intended for track 2 (e.g. the *Temple of Doom* mine cart), the
design below swaps in cleanly; see Open Decisions.

Working names are "inspired-by" names so the project is safe to share later. The source
scene is kept in the design notes.

#### Track 1 — Shire Downs (The Lord of the Rings: rolling hills)

- **Mood**: green, sunlit, bucolic. Opens the Grand Prix. Easiest track.
- **Layout**: ~1,400 m lap. Wide rolling hills with blind crests, a lane through a hobbit village
  (round doors in hillsides, the Party Tree), a wooden bridge over a brook, a mill, and a
  final climb past ruined watchtower stones with a risky shortcut through the ruins.
- **Set pieces**:
  - *Nazgûl shadow* (laps 2 and 3): a dark shape sweeps across a hill section; racers caught
    in it are slowed 30% for 2 s and lose their held item. Telegraphed by a shriek and a
    moving shadow decal.
  - *Fireworks* (lap 3): Gandalf-style fireworks go off over the Party Tree; a dragon-shaped
    rocket crosses the track low; purely visual plus a tiny camera shake.
- **Hazards**: wandering sheep (slow bumps), a flock of crows crossing the ruins shortcut.

#### Track 2 — Temple of the Idol (Raiders: Peruvian temple opening)

- **Mood**: jungle gloom to torchlit stone. Medium difficulty.
- **Layout**: ~1,600 m lap. Jungle approach → tarantula-cave tunnel → the dart corridor →
  the light-beam floor hall → the idol altar hairpin → the pit jump (the whip-swing gap) →
  long escape tunnel → collapsing stone door → outside, loop back through the jungle.
- **Set pieces**:
  - *Dart corridor*: pressure-plate tiles trigger dart volleys across the track; darts are
    visible projectiles that cause a brief spin. Safe tiles are darker.
  - *The boulder* (lap 3 only): as the pack enters the escape tunnel, the boulder drops in
    behind the last racer and rolls at ~110% of average race speed. Anyone it catches is
    flattened and respawned ahead of it. It stops at the stone door.
  - *Stone door*: closes slowly during the final lap; a late racer takes a slower side vent.
- **Hazards**: floor tiles that drop you a few metres into the pit route (slower, not fatal).

#### Track 3 — Tanis Run (Raiders: Egypt — dig site, Well of Souls, truck chase, the Ark)

- **Mood**: blazing desert, dust, brass. Hard track, long straights, wide drifts.
- **Layout**: ~1,900 m lap. Dig site switchbacks → the Map Room (a shaft of light marks the
  racing line) → descent into the Well of Souls (statues, snakes on the floor) → up through
  the Ark chamber → canyon truck-chase straight with cliff overhangs → marketplace chicane
  (baskets, carpets) → airstrip loop past a Flying Wing → back to the dig.
- **Set pieces**:
  - *Snakes*: rolling patches of snakes in the Well; driving through drops speed sharply
    unless you have a shield or the Ring.
  - *The truck*: an AI truck runs the canyon straight; you can draft it or get bumped by it.
  - *The Ark opens* (lap 3): in the Ark chamber, the Ark lid lifts; lightning arcs strike
    random points on the track for 8 s. Each strike is telegraphed by a glow 0.7 s ahead.
    Racers who are hit spin out.
  - *Flying Wing*: propeller spinning on the airstrip loop; the hitbox is a slow bump, not a kill.

#### Track 4 — Paris Fold (Inception: dream sequences)

- **Mood**: muted blue-grey, surreal, rain. The finale. Hardest track and the showpiece.
- **Layout**: ~2,000 m lap through four dream levels, each a section:
  1. *Café street*: everything on the street explodes outward in slow motion; debris is
     visual, the explosion is a 0.5 s "slow-mo" camera zone with no gameplay penalty.
  2. *The fold*: the Paris boulevard hinges upward 180°. The spline's up-vector rotates with
     it; you drive up the fold and continue on the underside of the city, upside-down to the
     camera, with rain falling "up". Item physics stay track-relative.
  3. *Hotel corridor*: a long, tilting zero-G corridor. Grip drops to 30%, hover height is
     clamped, the corridor itself slowly rotates around the spline. Items float.
  4. *Snow fortress*: snowy mountain downhill with banked S-curves and a short tunnel, then
     a seaside limbo city whose buildings are crumbling into the sea beside the road.
- **Set pieces**:
  - *The kick*: at the end of each lap, a van falls off a bridge in the far background; on
    the final lap the van's impact triggers a track-wide low rumble and a 1 s "kick" where
    the whole track lurches, shifting every racer a little. Purely chaos.
  - *Limbo collapse* (lap 3): sections of the limbo shoreline buildings fall across the road,
    opening a new shortcut through a lobby.
- **Music**: a brass-heavy, slowed-down pastiche cue; the whole track is pitch-shifted down
  slightly during the slow-mo café beat.

Each track also has a **lap-based intensity ramp**: lap 1 is clean, lap 2 adds hazards,
lap 3 fires the big set piece. This keeps the race readable for new players and lets
scripting stay simple (set pieces are keyed to "lap N started" events).

### 3.6 Vehicles

Three required vehicles plus a stretch roster of five so a race of eight is varied. Every
vehicle has three stats on a 1–5 scale: **Speed**, **Handling**, **Weight**. Stats sum to 9.

| Vehicle | Source | Speed | Handling | Weight | Type | Notes |
|---|---|---|---|---|---|---|
| **Pod Racer** | Star Wars Ep. I | 5 | 2 | 2 | Hover | Two engines + cable + pod; longest vehicle; rear engines flare on boost |
| **Batmobile** | Batman (1989) | 3 | 3 | 3 | Wheels | Default recommendation is the 1989 Burton car for its unmistakable silhouette; the Tumbler is the alternative (see Open Decisions) |
| **Nazgûl** | The Lord of the Rings | 4 | 3 | 2 | Hooves | Requested in build 1. Black horse with a galloping leg rig and red eyes; hooded wraith with an empty face, tattered cloak that streams at speed, sword and reins. Boost trails shadow smoke instead of flames |
| Mach 5 | Speed Racer (cartoon) | 4 | 4 | 1 | Wheels | Bonus pick. Built, but no further polish planned |
| DeLorean | Back to the Future | 4 | 3 | 2 | Wheels | Stretch. Trails fire at 88 (top speed) |
| Ecto-1 | Ghostbusters | 2 | 3 | 4 | Wheels | Stretch |
| Light Cycle | Tron | 5 | 3 | 1 | Hover | Stretch |
| Interceptor | Mad Max | 3 | 2 | 4 | Wheels | Stretch |
| Herbie | The Love Bug | 2 | 5 | 2 | Wheels | Stretch |

Every vehicle has: ~400–800 triangles, one 128×128 texture, a 4-colour palette variant for
duplicate picks, an idle animation, a boost VFX hook point, and a "hit" squash animation.

### 3.7 Lobby flow

1. The TV shows a big QR code, the local URL (e.g. `http://192.168.1.20:4000`), and a 4-letter
   room code as fallback.
2. Phone opens the page → enters a name (remembered on that phone) → appears on the TV
   instantly as a coloured player card. Xbox controllers appear on pressing **A**.
3. Everyone picks a vehicle on their own phone (or with the stick). The TV shows the choices.
4. Host player (the first to join, or anyone with a controller) picks track/mode. Ready-up.
5. Race. After the race, "Next race / Change cars / Lobby" on the TV, voted from phones.

The whole flow targets under 30 seconds from scan to green light.

---

## 4. Players, input, and the TV

### 4.1 Player counts and screen

- **Up to 4 human racers on one screen** (1 full, 2 side-by-side or top/bottom, 3–4 in quads).
  The low render resolution keeps four viewports cheap.
- **8 racers per race** total; AI fills the rest.
- Stretch: 5–6 humans with a 2×3 grid. Not in the MVP because viewports become too small on
  typical TVs; phones as controllers have no hardware cap, so this is purely a readability call.

### 4.2 iPhone as controller

Phones load a controller web page from the laptop server over the home Wi-Fi.

- **Layout (landscape)**: left half is a steering zone; right half has large **Accelerate**,
  **Brake/Reverse**, **Drift**, and **Item** buttons. Thumb-friendly, no small targets.
- **Steering default = touch slider**: horizontal drag on the left half, with a dead zone and
  auto-centre. This requires no permissions and works on plain HTTP over the LAN.
- **Steering option = tilt**: iOS requires HTTPS and a user permission prompt for motion
  sensors. Supported later via a self-signed certificate installed once per phone, or
  skipped. Touch is the default precisely to avoid this friction.
- **Haptics**: iOS Safari has no vibration API. Instead the phone screen flashes/pulses
  (hit, boost, item pickup) and shows the player's position, lap, and held item.
- **Stay awake**: Screen Wake Lock API (iOS 16.4+) so the phone doesn't sleep mid-race.
  Fallback: a looping silent video element.
- **Full-screen**: prompt to "Add to Home Screen" for a chrome-less controller; otherwise
  landscape lock via CSS and a "rotate your phone" overlay.
- **Latency budget**: input is sampled on the phone at 60 Hz and sent as a tiny binary
  message over a WebSocket. Typical home Wi-Fi round-trip is 10–40 ms; the simulation
  applies the latest input every fixed step. This is comfortably fine for an arcade racer.
  The phone shows a connection-quality dot so a bad Wi-Fi spot is visible.
- **Reconnect**: if a phone drops, its kart auto-drives for up to 10 s and the slot is held;
  reopening the page re-attaches by stored player ID.

### 4.3 Xbox controller

- Pairs to the laptop over Bluetooth or USB; the browser's **Gamepad API** reads it directly.
- Standard mapping: left stick steer, **RT** accelerate, **LT** brake, **A/RB** drift,
  **X/LB** item, **Y** look back, **Menu** pause. Rumble via the Gamepad haptics API where
  the browser supports it (Chrome/Edge do).
- Any mix of phones and controllers works in the same race.

### 4.4 Getting it on the TV

| Method | Latency (approx.) | Verdict |
|---|---|---|
| **HDMI cable from laptop to TV** | ~0 ms + TV's own game-mode latency | **Recommended.** Put the TV in Game Mode. |
| AirPlay screen mirroring (Mac → Apple TV) | ~100–150 ms | Playable but floaty. OK for casual nights. |
| Chromecast "Cast tab" / "Cast screen" | ~250–400 ms | Too laggy for racing. Avoid. |
| TV's built-in browser | varies | Most TV browsers lack WebGL performance. Avoid. |
| Miracast (Windows → TV) | ~100–200 ms | Same as AirPlay; acceptable fallback. |

Audio goes out through the TV via HDMI as well. The game has a "display latency"
setting that offsets the start-countdown beeps so the audio lines up with the lights.

---

## 5. Technical architecture

### 5.1 Stack choice

| Option | Pros | Cons | Decision |
|---|---|---|---|
| **TypeScript + Three.js + Vite + Node (ws)** | One language end to end; the phone controller is just another page from the same server; browser gamepad API; PS1 look is a small shader; trivially free; runs on Mac/Windows/Linux laptop | Need to build kart physics and a track pipeline ourselves (we want to anyway); no scene editor (use Blender) | **Chosen** |
| Godot 4 | Great editor, built-in gamepads, split-screen viewports, free | Serving a phone controller page needs a separate HTTP server or add-on; two languages (GDScript + web); PS1 shaders are community add-ons | Strong runner-up |
| Unity / Unreal | Mature | Heavy, licences/telemetry, phone controller still needs a custom web stack | No |

A browser-based host also means **anyone can test on their own laptop with no install**,
which matters for a hobby project built by one or two people in spare time.

### 5.2 Repository layout (monorepo, pnpm workspaces)

```
epic-racer/
├─ apps/
│  ├─ game/          # Three.js host: renders to the TV, runs the simulation
│  ├─ controller/    # Phone controller page (vanilla TS, tiny bundle)
│  └─ server/        # Node: static files + WebSocket input relay + room/QR
├─ packages/
│  ├─ shared/        # Protocol types, track/vehicle data schemas, math utils
│  └─ sim/           # Pure, deterministic kart simulation (no DOM, no Three.js)
├─ assets/
│  ├─ src/           # Blender .blend files, source textures, audio stems
│  └─ build/         # Exported glTF, baked textures, compressed audio (generated)
├─ tools/
│  ├─ blender/       # Export scripts: mesh + spline + gameplay markers -> glTF/JSON
│  └─ trackcheck/    # Validates track files: spline continuity, checkpoint order
├─ docs/
│  ├─ PLAN.md        # This document
│  ├─ ART_BIBLE.md   # PS1 constraints, palette, modelling checklist (to write)
│  ├─ PROTOCOL.md    # WebSocket message formats (to write)
│  └─ TRACK_FORMAT.md# Spline/markers schema (to write)
└─ package.json, pnpm-workspace.yaml, tsconfig.base.json, .editorconfig
```

### 5.3 Process model

```
 [iPhone Safari]  --ws-->  [Node server]  --ws-->  [Chrome on laptop: apps/game]
 [iPhone Safari]  --ws-->      |                        |  Gamepad API <-- [Xbox pad]
 [iPhone Safari]  --ws-->      |                        |  WebGL2 ------> [TV via HDMI]
                        serves /, /play, /controller
```

- `apps/server` is the single process you start (`pnpm start`). It serves the game page and the
  controller page, opens a WebSocket endpoint, prints the LAN URL and a QR code in the terminal,
  and opens the game page in the default browser.
- The **game page is the single authority**. It runs the fixed-step simulation and renders.
  The server only relays controller input; it has no game logic. This keeps "netcode" trivial.
- Phones are **thin clients**: send input, receive a small HUD state (position, lap, item,
  connection quality) at 10 Hz.

### 5.4 Simulation (`packages/sim`)

- Fixed time step at 60 Hz, render interpolates between the last two states.
- Deterministic and side-effect free so it can be unit-tested headless and later used for
  ghost replays (Time Trial) and for AI "lookahead".
- Core types: `Track` (spline, segments, checkpoints, item boxes, respawn points, surface
  zones), `Kart` (pose, velocity, drift state, boost timers, item, lap progress), `World`
  (karts, projectiles, hazards, scripted events).
- **Track spline**: Catmull-Rom (or cubic Hermite) through control points with per-point
  `up` vector and `width`. Each kart tracks its nearest spline parameter `t` every step
  (local search around last `t`, never global); progress = lap × length + arc(t). This gives
  race positions, respawn points, AI steering targets, and the gravity frame all from one
  structure.
- **Collision**: kart vs. track uses a low-poly collision mesh (separate from the visual mesh)
  with a few raycasts per kart (centre + wheels) to find the surface height and normal in the
  track-relative frame. Kart-vs-kart and kart-vs-item are spheres/capsules. No physics library.
- **AI**: follows the spline centre with a per-AI lateral offset, looks ahead by speed, uses
  items with simple position-based rules, and has a tunable "skill" (0–1) that scales reaction
  noise and top speed. Rubber-bands toward the pack within ±8%.
- **Scripted events**: a per-track script (plain TS) subscribes to events like `lapStarted(n)`,
  `kartEnteredZone(zoneId)`, `raceTime(t)` and spawns hazards, moves set-piece objects, or
  changes zone properties (grip, hover clamp, spline up-vector animation for the fold).

### 5.5 Rendering (`apps/game`) — the PS1 look

- Render to an offscreen target at **384×216** (16:9 analogue of 320×240) and upscale with
  **nearest-neighbour** to the TV. Per-viewport in split-screen (each viewport gets a
  proportionally smaller target so pixel size stays constant on screen).
- **Vertex snapping**: in the vertex shader, quantize clip-space XY to the low-res grid. This
  produces the PS1 polygon "wobble".
- **Affine texture mapping**: pass UVs pre-multiplied by `w` and divide in the fragment shader
  with `noperspective`-style interpolation emulation. Produces the signature texture warping on
  large near polygons. Tracks subdivide big ground polys to keep it tasteful.
- **No texture filtering, no mipmaps**, textures ≤128×128, 15-bit colour quantisation + a 4×4
  ordered dither in a full-screen pass.
- **Lighting**: per-vertex only, one directional sun + ambient + up to 2 dynamic point lights
  (boost glow, lightning). **No shadow maps**: karts have a blob-shadow decal.
- **Fog**: linear distance fog that doubles as the draw-distance cull (PS1 pop-in is part of
  the charm; segments beyond the fog are not drawn).
- **Camera**: chase cam with lag, drift-tilt, speed-FOV bump, and track-relative up so the
  Inception fold reads naturally.
- **UI/HUD**: HTML overlay (DOM) per viewport, pixel font, scaled with the viewport. Cheap and
  sharp.

Performance target: 60 fps with 4 viewports and 8 karts on a 5-year-old laptop with integrated
graphics. The low render target makes fill rate trivial; the budget is draw calls, so tracks are
chunked into ~30 merged meshes and karts share materials.

### 5.6 Networking (`apps/server`, `packages/shared`)

- WebSocket (the `ws` package). Binary messages, little-endian:
  - **Phone → server → game**: `Input { playerId:u8, seq:u16, steer:i8, throttle:u8, brake:u8, buttons:u8 }`
    at up to 60 Hz; the server forwards the latest per player per tick (coalesces bursts).
  - **Game → server → phone**: `Hud { position:u8, lap:u8, item:u8, speedPct:u8, flags:u8 }`
    at 10 Hz, plus JSON for lobby events (join, name, vehicle pick, ready, vote).
- Room code is 4 letters; the QR encodes `http://<lan-ip>:4000/c/<code>`.
- Players get a persistent `playerId` in `localStorage` for reconnects.
- Server writes nothing to disk and never leaves the LAN. No accounts, no telemetry.
- The game page can also run **without the server** for development: Xbox pads and keyboard
  work directly, and a "virtual phone" dev panel simulates a touch controller.

### 5.7 Content pipeline

- **Modelling**: Blender (free). One `.blend` per track and per vehicle in `assets/src`.
- **Export**: a Blender Python script exports glTF with custom `extras`:
  - visual meshes (tagged by chunk),
  - `collision` meshes,
  - the track **spline** (a Blender curve) sampled to control points with `up` and `width`,
  - **markers**: start grid slots, checkpoints, item boxes, respawn points, zones
    (grip/hover/slow-mo), and set-piece object anchors.
- **Validate**: `tools/trackcheck` fails the build if the spline is not a closed loop,
  checkpoints are out of order, or any chunk exceeds the triangle budget.
- **Textures**: painted at 64×64 or 128×128, indexed palette per track (16–64 colours), PNG.
- **Audio**: Web Audio API; CC0 sound effects (Kenney, freesound CC0 only); original or CC-BY
  music in a chiptune/early-PS1 style. Credits file kept in `assets/CREDITS.md`.

### 5.8 Tooling and quality

- pnpm, TypeScript strict, Vite, ESLint + Prettier, Vitest for `packages/sim` and `shared`.
- Playwright smoke test: boot server, open game, open a fake controller, join, start a race,
  assert a lap completes with a scripted input.
- GitHub Actions: lint, typecheck, unit tests, trackcheck on every push. No deploy; this is a
  home game.
- Debug overlays: spline visualiser, kart state, zone volumes, network latency graph, and a
  free-fly camera. Hotkeys documented in `docs/DEBUG.md`.

---

## 6. Art direction: "recognisable, not exquisite"

> **Decision (build 1):** the default look is **Modern**: full TV resolution, real-time soft
> shadows, sky reflections, filtered textures, tone mapping, roughly Mario Kart Double Dash
> to modern-indie fidelity. The PS1 treatment below survives as an optional **Retro filter**
> (F2 / `?look=retro`): same scene, 240-line buffer, vertex wobble, nearest textures and
> 15-bit dithering. Poly budgets below are raised accordingly: vehicles 3k-15k tris.


- **Poly budgets**: vehicles 400–800 tris; track chunk ≤2,000 tris; whole track ≤60k tris;
  props 20–150 tris. Spectators are 2-tri billboards.
- **Textures**: ≤128×128, palette-limited, hand-painted or heavily posterised photos. No
  normal maps, no PBR.
- **Palette per track**: Shire Downs greens/golds; Temple browns/torch-orange/jungle green;
  Tanis sand/brass/sky-blue; Paris Fold blue-grey/rain with one warm accent.
- **Silhouette first**: block out every vehicle in 50 tris and test recognition from the couch
  before adding detail. Same for landmarks (Party Tree, idol altar, Flying Wing, folded street).
- **Motion sells it**: pod racer engine flaps, Batmobile afterburner, Mach 5 wheel spin,
  rain, dust puffs, drift sparks. Cheap particles, big payoff.
- **UI**: pixel font, chunky bevelled panels, VHS-tracking transition between menus.
- **Intellectual property note**: this is a private, non-commercial home project, so it can
  lean into the references. All assets are built from scratch (no ripped models, sounds, or
  music). Track and vehicle names in code use the "inspired-by" working names, so if the repo
  is ever shared publicly, nothing needs renaming.

---

## 7. Roadmap

Phases are ordered so there is always something playable. Effort is a rough guide for one
person working evenings and weekends; two people roughly halves calendar time.

| Phase | Deliverable | Done when | Effort |
|---|---|---|---|
| **M0 Skeleton** | Monorepo, lint/test/CI, empty game page, server that serves it and prints a QR | `pnpm start` opens a page showing a spinning cube and a QR code | 1 week |
| **M1 Gray-box drive** | One flat loop track (from Blender), one box kart, keyboard + Xbox pad, PS1 render pipeline | You can drive a wobbly, dithered box around a loop at 60 fps | 2 weeks |
| **M2 Phones + split-screen** | Controller page, WebSocket input, lobby with names/QR, 1–4 viewports | Four people on phones/pads drive four boxes on one TV | 2 weeks |
| **M3 Racing core** | Spline tracking, laps/checkpoints/positions, drift + mini-turbo, boost pads, respawn, 8-kart AI, results screen | A complete 3-lap race with positions and a podium, all gray-box | 3 weeks |
| **M4 First real content** | Shire Downs track (art + set pieces), Pod Racer + Batmobile + Mach 5 models, vehicle select, HUD, SFX | A real race on a real track with the three required vehicles | 3 weeks |
| **M5 Items** | All 9 items, item boxes, position-weighted distribution, projectile/hazard systems | Items change race outcomes and feel fair in playtests | 2 weeks |
| **M6 Tracks 2–4** | Temple of the Idol, Tanis Run, Paris Fold including the gravity fold and zero-G corridor | All four tracks complete with lap-3 set pieces | 7 weeks |
| **M7 Grand Prix + polish** | GP mode, music, menus, Family mode, display-latency setting, reconnect handling, stretch vehicles | A full GP night with 4 humans, no engineering intervention | 3 weeks |
| **M8 Stretch** | Time Trial ghosts, Battle mode, 6-player grid, tilt steering over HTTPS | As time allows | — |

Total to a complete game: roughly **23 weeks** of hobby time. A playable party night (M4) is at
about **8 weeks**.

### Status

- **M0 Skeleton**: done.
- **M1 Gray-box drive**: done. Proving Grounds test track with banked turns, a hill and a full
  vertical loop; kart physics with drift and mini-turbo, boost pads, start boost; 8-kart AI;
  modern renderer with retro filter; Pod Racer, Batmobile, Nazgûl and Mach 5 models.
- **M2 Phones + split-screen**: done. Local server with QR code, phone controller (drag-to-steer, multi-touch buttons, wake lock, reconnect), TV lobby (phones, Xbox pads, keyboard), 1-4 player split-screen, phone HUD, results; end-to-end test with two simulated iPhones.
- **Next**: character detail pass, then M3 racing polish and M4 first real track.

### Original M0 checklist

1. Initialise the pnpm monorepo with `apps/game`, `apps/controller`, `apps/server`,
   `packages/shared`, `packages/sim`.
2. `apps/server`: Express or plain `http` static server + `ws`, LAN IP detection, QR in terminal
   (`qrcode-terminal`), auto-open browser.
3. `apps/game`: Vite + Three.js, low-res render target + nearest upscale, spinning cube.
4. `apps/controller`: a page that shows the room code and sends touch position over the socket.
5. CI workflow: lint, typecheck, test.
6. Write `docs/PROTOCOL.md` and `docs/TRACK_FORMAT.md` as the first two specs.

---

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Casting latency ruins the feel | High | Recommend HDMI; AirPlay as fallback; label Chromecast as unsupported in the setup screen |
| Home Wi-Fi jitter | Medium | 60 Hz input with latest-wins, 10 s auto-drive on drop, connection dot on phone, "use 5 GHz" tip |
| iOS Safari quirks (sleep, no vibration, motion permission) | Medium | Wake Lock + silent-video fallback, visual haptics, touch steering by default |
| Four tracks with set pieces is a lot of art | High | Gray-box all four in M3 so layouts are fun before art; strict poly/texture budgets; reuse props |
| Kart feel is hard to tune | Medium | Build the feel in M1–M3 on gray-box with a live tuning panel; copy proven Mario Kart numbers as starting points |
| Split-screen performance | Low | Low-res targets; chunked meshes; test 4 viewports in M2 before art lands |
| IP concerns if shared | Low (home use) | Original assets, inspired-by names in code, no distribution |
| Scope creep (more films, more cars) | Medium | Roster/tracks beyond the brief are explicitly "Stretch"; the brief's 4 tracks + 3 cars define done |

---

## 9. Open decisions

Defaults are chosen so work can start immediately; override any of them.

1. **Track 2**: default is the Raiders temple opening. Alternative: Temple of Doom mine cart
   (would make tracks 2 and 3 two different films).
2. **Batmobile version**: default 1989 Burton car (best silhouette). Alternative: the Tumbler.
3. **Cartoon vehicle**: resolved. The Nazgûl rider replaced it as the third featured vehicle;
   the Mach 5 stays as a bonus pick.
4. **Max humans on screen**: default 4. Stretch to 6 only if playtests want it.
5. **TV connection**: default assumes a laptop with HDMI out. If the laptop is a Mac without
   HDMI, a USB-C to HDMI adapter is the one small purchase worth making; otherwise AirPlay.
6. **Steering on phones**: default touch slider; tilt is stretch.
7. **Project name**: working title *Epic Racer* (the repo name).
