# Epic Racer

A free, home-built couch-multiplayer kart racer. Race movie vehicles (Pod Racer, Batmobile,
Nazgûl rider) through movie scenes on a TV, using iPhones or Xbox controllers as pads.

See [docs/PLAN.md](docs/PLAN.md) for the full design, and [docs/screens](docs/screens) for
renders from the latest build.

## Play it

### At home with phones (the full setup)

**One-time:** get the game folder onto the computer that drives the TV. Either download it
from GitHub (on the `claude/keen-curie-e7kh6o` branch: **Code → Download ZIP**, then unzip),
or clone it so the launcher can fetch updates by itself:

```sh
git clone -b claude/keen-curie-e7kh6o https://github.com/dinocode00/epic-racer.git
```

**Every time:** double-click the launcher in the folder:

- **Mac:** `Start Epic Racer.command` (the first time, right-click it → **Open** → **Open**,
  because macOS asks about files downloaded from the internet)
- **Windows:** `Start Epic Racer.bat` (if SmartScreen warns, choose **More info → Run anyway**)
- **Linux:** `start-epic-racer.sh`

The launcher installs Node.js privately inside the folder if it isn't already on the computer
(no admin rights needed), fetches the latest version (for a cloned folder), installs and
builds only when something changed, starts the game and opens it in your browser. The first
run takes a few minutes; after that it starts in seconds. Keep its window open while you
play (it shows the QR code for phones); close it to stop the game.

Prefer a terminal? `pnpm install` then `pnpm start` does the same with Node 22+ installed.

1. On the computer, open `http://localhost:4000` and go fullscreen (F11). Mirror or cast
   that screen to the TV (HDMI, AirPlay, Chromecast tab cast…).
2. Each player scans the QR code with their iPhone (same Wi-Fi), types a name and picks a
   ride. Xbox controllers join with **A**, the keyboard with **Enter** / **Space**.
3. When everyone is **Ready** the race starts. 2 players split the screen top/bottom,
   3-4 players get quarters.

If phones can't reach the URL, check they're on the same Wi-Fi and that the computer's
firewall allows Node on port 4000.

### Couch mode (no server)

Any static copy of `apps/game/dist` (e.g. the hosted build) runs without the server: the
lobby switches to **couch mode** for the keyboard (up to two players) and Xbox controllers.
Phones need the home setup above.

## Controls

| Action                     | Keyboard (solo) | Keyboard P1 / P2 (shared) | Xbox controller    | Phone                 |
| -------------------------- | --------------- | ------------------------- | ------------------ | --------------------- |
| Join / ready               | Enter           | Enter / Space             | A                  | READY                 |
| Change ride (lobby)        | ← →             | ← → / A D                 | Stick / D-pad      | Tap a ride            |
| Change track (lobby)       | T               | T                         | LB / RB            | ◀ ▶                   |
| Steer                      | ← → or A D      | ← → / A D                 | Left stick / D-pad | Drag on the left half |
| Accelerate                 | ↑ or W          | ↑ / W                     | RT                 | GAS                   |
| Brake / reverse            | ↓ or S          | ↓ / S                     | LT                 | BRAKE                 |
| Drift (hold while turning) | Space / Shift   | Right Shift / Left Shift  | A / RB             | DRIFT                 |
| Use item (hold to trail)   | E / Ctrl        | . or Right Ctrl / E       | X or LB            | ITEM                  |
| Look back                  | C               | , / C                     | Y                  | —                     |
| Leave (lobby)              | Backspace       | Backspace / Q             | B                  | —                     |
| Toggle Retro look          | F2              | F2                        | —                  | —                     |

Racing tips:

- **Drift**: hold drift through a corner; the sparks go blue → orange → purple, and letting
  go fires a mini-turbo. At full speed the tightest corners need a drift or a lift.
- **Slipstream**: tuck in close behind another racer; the SLIPSTREAM meter fills and fires
  a boost.
- **Bump**: ram someone from behind and they wobble and slide sideways with barely any
  steering for a moment.
- **Hazards** that spin you (riders, falling rock, boulders) cost you speed and control for
  about a second, but you come out still facing the right way.
- **Start boost**: press GAS when the countdown shows **1** (not earlier).
- **Items**: drive through the glowing boxes. Tap ITEM to use what you get. Hold ITEM with
  arrows, a firework or caltrops to trail it behind you as a shield, then let go to fire;
  hold BRAKE (or look back) as you let go to fire backwards.
- **Specials**: sometimes a box gives your vehicle's own ability: the Nazgûl's Morgul
  Charge (a blade that cuts racers alongside), the Pod Racer's Flame Vent (scorches anyone
  behind), the Batmissile (ram straight through) and the Mach 5's Auto-Jacks + robot bird.
- **Great Eagle** (Middle-earth's own item): carried up the road, safe from everything.

## Developer URL options

`?players=1..4` · `?demo=1` (autopilot) · `?t=20` (skip ahead) · `?look=retro` ·
`?vehicles=pod,bat,nazgul,mach5` · `?scene=showroom` · `?fixed=1` (deterministic frames)

## Layout

```
apps/game        Three.js host: renders to the TV, runs the race
apps/controller  Phone controller page
apps/server      Local server: serves pages, relays phone input, QR code
packages/sim     Pure, deterministic race simulation (unit tested)
packages/shared  Protocol and data types
```
