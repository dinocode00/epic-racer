# Epic Racer

A free, home-built couch-multiplayer kart racer with a PlayStation 1 look. Race movie
vehicles (pod racer, Batmobile, Mach 5) through movie scenes (hobbit hills, the Raiders
temple, the Tanis desert, the folding Paris of Inception) on a TV, using iPhones or Xbox
controllers as pads.

Status: **planning**. Read [docs/PLAN.md](docs/PLAN.md) for the full design, architecture,
and roadmap. No code yet; the first milestone (M0 Skeleton) is described at the end of the
plan's roadmap section.

## How it will work

1. Start the game on a laptop plugged into the TV over HDMI.
2. The TV shows a QR code. Scan it on a phone to get a touch controller. Or press A on a
   paired Xbox controller.
3. Pick a car, pick a track, race. Up to four people on one screen, eight racers per race.

Stack: TypeScript, Three.js, Vite, Node + WebSockets, Blender for assets. Everything is
open source and runs on the home network only.
