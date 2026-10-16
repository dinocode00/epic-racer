# Epic Racer

A free, home-built couch-multiplayer kart racer. Race movie vehicles (Pod Racer, Batmobile,
Nazgûl rider) through movie scenes on a TV, using iPhones or Xbox controllers as pads.

See [docs/PLAN.md](docs/PLAN.md) for the full design, and [docs/screens](docs/screens) for
renders from the latest build.

## Run it

Requires Node 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm start          # builds, starts the server, prints a URL + QR code
```

Open the printed URL on the laptop connected to the TV. Phones scan the QR code to join.

## Controls

| Action | Keyboard | Xbox controller | Phone |
|---|---|---|---|
| Steer | ← → / A D | Left stick / D-pad | Drag on the left half |
| Accelerate | ↑ / W | RT | GAS |
| Brake / reverse | ↓ / S | LT | BRAKE |
| Drift (hold while turning) | Space / Shift | A / RB | DRIFT |
| Look back | C | Y | — |
| Toggle Retro look | F2 | — | — |

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
