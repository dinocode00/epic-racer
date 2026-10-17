# Controller / Second-Screen Item UX and Movie Lore for Themed Items

Scope: (A) phone-as-controller and gamepad UX for a couch kart racer's item system (browser/WebGL game on a laptop cast to a TV; iPhone web-page controllers over local Wi-Fi WebSockets, plus Xbox controllers via the Gamepad API); (B) verified film lore for Pod Racer, Batmobile, Mach 5 and Lord of the Rings themed items. Research date: 2026-10-17.

Sourcing note: several fan wikis (Wookieepedia, Batman Wiki) returned HTTP 402 when fetched directly, so some lore facts come from search-result summaries of those pages, not from full page reads. Each is flagged below.

## A1. How phone-as-controller / second-screen games handle private info, alerts and controls

### Takeaway
The useful lesson from AirConsole, Jackbox and the Wii U is this. In an action game, players should not have to look at the phone. Keep the phone to big, labelled, eyes-free touch zones, and use it for coarse state (held-item icon, player colour, "you are out" screens). Anything time-critical, such as incoming-threat warnings and aiming, belongs on the TV, with audio and haptics as backup. Nintendo found that a player can't watch both screens at once, so a design that needs both must give each one its own time.

### Cited Findings
- AirConsole's guidelines say "a phone is not a regular gamepad / xbox controller and should not be treated as such". Their main takeaways: label every touch area with its function, make controls as large as possible, and avoid d-pads and virtual joysticks. — [AirConsole: Smartphones as Controllers](https://developers.airconsole.com/smartphones-as-controllers)
- AirConsole separates round-based games from action games. In round-based games, players can glance down, so buttons can be relatively small. In action games, where success depends on timing, players must be able to give input "without having to look at the smartphone". For eyes-up play they suggest swiping and gyroscope input instead of virtual buttons. — [AirConsole: Smartphones as Controllers](https://developers.airconsole.com/smartphones-as-controllers); [Game Developer: AirConsole – Using Smartphones as Controllers](https://www.gamedeveloper.com/design/airconsole-using-smartphones-as-controllers)
- AirConsole recommends switching the phone to a different screen for game states such as death (a "You are dead" view) instead of leaving the in-game controller up. They also recommend tinting the controller in the player's character colour. — [AirConsole: Best practices](https://developers.airconsole.com/best-practices); [AirConsole Checklist](https://developers.airconsole.com/airconsole-checklist)
- Jackbox's core design idea is that each phone shows private information only its owner can see. The phone UI runs in the browser with no app. One Jackbox engineer notes that "you can't feasibly cram a dozen buttons and replicate a joystick on an iPhone." Jackbox hired a phone UX advocate in 2019. — [Built In Chicago: These Design Principles Made Jackbox a Party Game Phenomenon](https://www.builtinchicago.org/articles/jackbox-games-design-party-pack)
- Wii U / ZombiU, from Iwata Asks: a second screen that other players can't see gives "a new approach for multiplayer, especially asymmetric gameplay". The developers also found that a player can't watch both screens at once, so the design had to give time to each one. — [Iwata Asks: ZombiU p.3](https://iwataasks.nintendo.com/interviews/wiiu/zombiu/0/2/)
- Nintendo Land's asymmetric structure ("one person plays a different role") came out of early prototypes. The best-known example is Luigi's Ghost Mansion, where the ghost is visible only on the GamePad. — [Iwata Asks: Nintendo Land](https://iwataasks.nintendo.com/interviews/wiiu/nintendo-land/0/0/); [Wikipedia: Nintendo Land](https://en.wikipedia.org/wiki/Nintendo_Land)
- Iwata later admitted that "asymmetric gameplay" was hard to explain to consumers, and that the GamePad had not done for Wii U what Wii Sports did for Wii. — [Nintendo Life](https://www.nintendolife.com/news/2013/06/iwata_nintendo_searching_for_a_different_expression_to_describe_the_gamepads_experience); [Kotaku](https://kotaku.com/nintendo-wants-to-re-convince-you-the-wii-u-gamepad-is-514096068)

### Inferences
- In a racer, a player's eyes are on the TV almost all the time. So the TV HUD must show each player's held item, for example an icon next to their kart or name tag, or in their split-screen corner. The phone can echo it as a large icon on the ITEM button. That confirms what you hold at a glance, and it makes the button self-labelling, as AirConsole recommends.
- Use the phone for state that is either not urgent or private: the item-slot icon, a cooldown ring on the ITEM button, "eliminated / respawning" screens, and lobby and kart selection. Don't show threat warnings only on the phone, because players won't look down in time. Put warnings on the TV (an edge-of-screen arrow or a flashing banner in that player's colour) and back them up with haptics on the phone or controller.
- Private hidden information, such as a secret item or a hidden trap you placed, is a possible Wii U-style asymmetric twist. But the Iwata finding about not watching both screens suggests limiting it to moments with natural downtime, such as the item roulette or a respawn.
- Tint each phone controller background in the player's kart colour, as AirConsole recommends. Players then match phone, kart and HUD instantly, which also helps with cast-latency confusion.
- Casting the laptop to a TV (Chromecast/AirPlay) can add noticeable video latency. Phone input to laptop is fast over local WebSockets, but the TV image lags. This argues for generous item timings (telegraphed projectiles, warning lead time of roughly 0.5 s or more). That figure is a design inference, not a measured number.

### Gaps
- I found no official Jackbox controller-layout guidelines, only secondary coverage.
- Mario Party Superstars, Kahoot and PlayLink-style "use your phone" games were not researched in depth, because of tool-call limits.
- I found no measured data on cast latency for Chromecast or AirPlay screen mirroring.

## A2. Haptics: iOS Safari, Android Chrome, Xbox controller via the Gamepad API

### Takeaway
iOS Safari still does not support `navigator.vibrate`. The only route to web haptics on iPhone is the `<input type="checkbox" switch>` trick (Safari 17.4+), which fires a system haptic tick when the user directly taps a switch. One library vendor claims that iOS 26.5 limits it to single ticks per tap (this is unverified). Android Chrome supports `navigator.vibrate` with patterns. Firefox removed the Vibration API in Firefox 129. Xbox rumble works through `gamepad.vibrationActuator.playEffect('dual-rumble', …)`, and `'trigger-rumble'` (impulse triggers) works only in Chromium 126+.

### Cited Findings
- **iOS Vibration API:** Safari on macOS, iPadOS and iOS does not support `navigator.vibrate` in any version. — [TestMu AI: Vibration API browser support](https://www.testmuai.com/learning-hub/vibration-api-browser-support/); see also [MDN: Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- MDN notes that some devices won't vibrate when they are in Silent or Do Not Disturb mode. — [MDN: Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- **iOS switch trick:** Safari 17.4 introduced `<input type="checkbox" switch>`. Toggling it fires the system haptic (Taptic Engine), and libraries use a hidden switch to produce haptics. One project reports it working on iOS 18. — [ios-vibrator-pro-max (GitHub)](https://github.com/samdenty/ios-vibrator-pro-max); [Tony Seets: web-haptics colophon (Mar 2026)](https://tonyseets.com/colophon/2026-03-02-haptic-feedback/); [Medium: Web Haptics npm package](https://medium.com/@springmusk/web-haptics-the-npm-package-everyones-adding-for-haptic-feedback-4c774f10caaa)
- **iOS 26.5 change (vendor claim, unverified):** The "haptics" library site claims support for iOS 17.4 to 26.5+. It says multi-tick patterns work on iOS 17.4–26.4, but that "Apple's 26.5 patch closed every programmatic re-tick path". On 26.5+, multi-segment presets fire only their first tick. The site's approach places an invisible switch overlay under each `[data-haptic]` element, so the user's real tap (`isTrusted: true`) lands on the switch. The FAQ says this "requires direct user interaction with a switch." — [haptics (haptics-web.vercel.app)](https://haptics-web.vercel.app/)
- The same site lists Android Chrome, Edge and Samsung Internet as getting `navigator.vibrate` "with full pattern timing sequences". Firefox Android is listed as unsupported because the Vibration API was removed in Firefox 129. — [haptics-web.vercel.app](https://haptics-web.vercel.app/)
- Haptics need a Taptic Engine (iPhone 7 or later). iPads have none, so the switch does nothing there. — [search summary of web-haptics library docs](https://pub.dev/packages/web_haptics)
- **Gamepad API:** The API is `gamepad.vibrationActuator.playEffect(type, params)`, where type is `"dual-rumble"` or `"trigger-rumble"`. The params are `duration` and `startDelay` in ms, plus `strongMagnitude` (low-frequency motor), `weakMagnitude` (high-frequency motor), `leftTrigger` and `rightTrigger`, each 0.0–1.0. The trigger params apply only to `trigger-rumble`. A new call overrides any ongoing effect. The call returns a Promise that resolves to `"complete"` or `"preempted"`. It rejects with `InvalidStateError` if the document is hidden and `NotSupportedError` if the actuator lacks the type. — [MDN: GamepadHapticActuator.playEffect()](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect)
- The interface also has `effects` (an array of supported effect types, used for feature detection), a deprecated `type` property, `reset()` to stop effects, and the older `pulse(value, duration)` on `hapticActuators[0]`. MDN marks the feature as not Baseline. — [MDN: GamepadHapticActuator](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator)
- **trigger-rumble support:** Chrome and Edge from 126; not supported in Firefox; not supported in Safari or iOS Safari through 26.x. — [Can I Use: trigger-rumble (playEffect)](https://caniuse.com/mdn-api_gamepadhapticactuator_playeffect_type_trigger-rumble); [Can I Use: effects trigger-rumble](https://caniuse.com/mdn-api_gamepadhapticactuator_effects_type_trigger-rumble); [Windows Report: Chrome trigger rumble, Xbox One controllers on Windows 10+](https://windowsreport.com/google-chrome-introduces-trigger-rumble-for-gamepads-the-browser-will-also-support-xbox-one-controllers-on-windows-10-and-later/)
- web.dev recommends checking `gamepad.vibrationActuator.effects.includes('trigger-rumble')` and falling back to `'dual-rumble'`. Both the browser and the hardware must support the effect. — [web.dev: Gamepad](https://web.dev/gamepad)

### Inferences
- **Phone haptics plan.** On Android, call `navigator.vibrate([...])` freely, for example when hit, on an item pickup, or on a warning. On iPhone, haptics can only fire as a direct result of a tap on a switch element. So the ITEM, GAS and DRIFT buttons could each sit on top of a hidden switch, giving a confirmation tick when pressed. But the phone cannot vibrate on its own when a shell is incoming or you get hit, because there is no programmatic path. This is consistent with the vendor's 26.5 claim, and Apple has always required a user gesture. iPhone players' incoming-threat alerts must therefore be visual or audio (TV banner, a phone screen flash in the player colour, a sound).
- A full-screen colour flash on the phone (red edge glow) is a cheap, reliable "you got hit / incoming" cue on iOS. It works in peripheral vision even while the player watches the TV.
- **Xbox plan.** Use `dual-rumble` for hits, boosts and drift-charge milestones. Feature-detect `trigger-rumble` for Chromium on Windows: for example, rumble the right trigger while boosting or the left trigger on a brake or drift. Guard calls with a check on `vibrationActuator`, and catch rejections. Effects reject when the tab is hidden, which matters when the laptop window loses focus during casting.
- Gamepad API support for `dual-rumble` in Safari and Firefox is not confirmed by the sources fetched. Treat Chromium (Chrome or Edge on the host laptop) as the target browser for controller rumble.

### Gaps
- The per-browser Can I Use rows for `dual-rumble` (Safari, Firefox) were not retrieved. From prior knowledge, Safari added `vibrationActuator` around 16.4 and Firefox only exposes the non-standard `pulse` behind a preference. This is unverified and should be checked on caniuse.com before relying on it.
- No Apple release note was found confirming the iOS 26.5 haptic change. It is a single vendor's claim.
- I found no W3C "Web Haptics" standards proposal with shipping status in this pass.

## A3. Single item button design: forward/back, hold-to-drag, touch aiming

### Takeaway
Mario Kart Tour's touch scheme is the established pattern for touch: tap to use, swipe up to throw forward, swipe down to throw backward. For a gamepad, the Mario Kart convention is to aim with the stick (up/neutral fires forward, down fires back). Some items allow only one direction.

### Cited Findings
- Mario Kart Tour: tapping the item fires it (forward by default). Swipe up throws it ahead and swipe down throws it behind. For example, Red Shells can go forward with a swipe up or backward with a swipe down. Some items work only one way (Bowser's Shell only forward). Mushrooms are used with a tap. — [GameRevolution: Mario Kart Tour Controls](https://www.gamerevolution.com/guides/600627-mario-kart-tour-controls-how-to-drift-use-items); [Gamepur: Mario Kart Tour Controls](https://www.gamepur.com/guides/mario-kart-tour-controls); [iMore: Every item in Mario Kart Tour](https://www.imore.com/every-weapon-and-item-mario-kart-tour)
- Caveat: these guides are several years old and were not checked against the current game version. — same sources
- Mario Kart: Double Dash used a two-character system in which each character holds an item and the riders can swap. This is a precedent for two-slot item swapping. — [Wikipedia: Mario Kart: Double Dash](https://en.wikipedia.org/wiki/Mario_Kart:_Double_Dash)
- AirConsole recommends swipes over virtual sticks for eyes-free action input. — [AirConsole: Smartphones as Controllers](https://developers.airconsole.com/smartphones-as-controllers)

### Inferences
- **Phone ITEM button.** Tap fires forward (the default). Swipe down on the ITEM button, or flick it toward the bottom edge, fires backward. Press and hold makes the item trail behind as a shield and drops it on release (the Mario Kart "drag" behaviour). Because the steering is already drag-to-steer on another area, keep the ITEM swipe gesture confined to the ITEM button's own large zone so it doesn't conflict with steering.
- **Xbox.** Use a single item button (e.g. RB or A, per the existing mapping). Left stick down while pressing fires backward. Hold the button to trail the item and release to drop it.
- **Two-slot swapping.** This adds a second control (a swap button) and more cognitive load. On the phone, a swipe up on the ITEM button could swap slots, but that clashes with Mario Kart Tour's "swipe up = forward". Keeping one slot, or a Mario Kart 8-style double item that is used in order, is the simpler path for couch play.
- Show the aim direction on the TV briefly, for example a small arrow on the kart for 0.3 s when the item fires, so players learn whether they fired forward or back.

### Gaps
- Beach Buggy Racing's mobile item controls were not researched.
- I found no source on how Mario Kart 8 Deluxe's current hold-to-drag interacts with stick direction (this is from general knowledge, not verified here).

## A4. Latency, readability, incoming-threat warnings and audio in shared-screen play

### Takeaway
No dedicated sources were found in this pass. The guidance below is inferred from the A1 and A2 findings: the TV is the primary display, the phone can't be relied on for timely glances, and iOS can't vibrate on events.

### Cited Findings
- Players can't watch both screens at once, so time-critical information should not be split across them. — [Iwata Asks: ZombiU p.3](https://iwataasks.nintendo.com/interviews/wiiu/zombiu/0/2/)
- Action-game inputs should not require looking at the phone. — [AirConsole: Smartphones as Controllers](https://developers.airconsole.com/smartphones-as-controllers)
- Gamepad effects reject with `InvalidStateError` when the document is hidden. — [MDN: playEffect()](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect)

### Inferences
- **Incoming threats.** Put the warning in the target player's split-screen pane (or by their name tag on a shared screen), using that player's colour and an arrow pointing toward the threat's direction. Pair it with a distinct per-item audio stinger (e.g. a Nazgûl shriek for a homing item). On Android or Xbox, add a short rumble. On iPhone, flash the phone screen edge.
- **Split-screen audio.** All players share the TV's speakers, so positional cues can't be per-player. Use distinct sounds per threat type rather than relying on stereo panning. The phone speaker could play a personal "incoming" ping; iOS web audio needs a user gesture to unlock, which the join/ready tap can provide.
- Make projectiles slower or more telegraphed than single-screen racers do, to make up for cast latency.

### Gaps
- I found no sources on audio-cue design for split-screen racers, or on measured readability or warning lead times in kart games.

## B1. Pod Racer / Star Wars Episode I lore (Boonta Eve Classic)

### Takeaway
Sebulba's documented film cheats include a hidden, illegal flame vent or flamethrower on his pod, used to roast Clegg Holdfast's engines. He also throws a piece of metal into Mars Guo's engine, ramming and sideswiping other racers, and secretly sabotages Anakin's pod. Tusken Raiders shoot at Anakin's pod. The idea that Sebulba threw a "tri-cross" or spanner directly at Anakin is not supported: the thrown object hit Mars Guo's engine. Wreckage from that crash then damaged one of Anakin's cables.

### Cited Findings
- Sebulba's pod carried an illegal hidden flamethrower, which he used to roast Clegg Holdfast's engines (sending him into a canyon wall). He also tried it on Anakin, who avoided it. — search-result summaries of [Wookieepedia: Flamethrower](https://starwars.fandom.com/wiki/Flamethrower) and [Wookieepedia: Sebulba's Podracer (Legends)](https://starwars.fandom.com/wiki/Sebulba's_Podracer/Legends) (direct fetch blocked, HTTP 402)
- Sebulba tossed a piece of metal into Mars Guo's engine, destroying it. A piece of that wreckage then took out one of Anakin's cables. — search-result summary of [Wookieepedia: Boonta Eve Classic (32 BBY)](https://starwars.fandom.com/wiki/Boonta_Eve_Classic_(32_BBY)/Legends)
- Sebulba secretly sabotaged part of Anakin's pod, causing a turbine to overheat later in the race. He also destroyed Mawhonic's Podracer early in the race. — same Boonta Eve summary
- Tusken Raiders shot at Anakin's pod as it exited a cave section of the course. — same Boonta Eve summary
- Finish: Anakin boosted his engines and, in the tangle at the end, Sebulba's left engine broke away and he crashed. — same summary
- The official Star Wars Databank says Sebulba was "not above cheating to win a race, and would even resort to illegal weapons." — [StarWars.com Databank: Sebulba](https://www.starwars.com/databank/sebulba)
- The "nail shooter" and "buzz saw" weapons come from Legends-era (non-film) material about Sebulba's pod, not the film. — summary of [Wookieepedia: Sebulba's Podracer (Legends)](https://starwars.fandom.com/wiki/Sebulba's_Podracer/Legends)

### Inferences
- **Item ideas:** "Sebulba's Flame Vent" (a short-range side or rear flame burst), "Scrap Toss" (a thrown debris projectile that damages the target's engine and slows it), "Tusken Sniper" (a hazard or item where shots come from the canyon rim at the leader), "Sabotage" (a mine that causes overheat: boost disabled, smoke trail). A pit-droid quick repair could cure the overheat.
- Energy binders and Anakin's "trick" moves (such as his late-race boost) are thematically good for a boost item. Their film details were not verified in this pass.

### Gaps
- Pit droids, energy-binder mechanics and the Beggar's Canyon / Arch Canyon hazard list were not fetched. Wookieepedia pages were blocked (HTTP 402).
- The exact film-versus-Legends wording of the Holdfast and Mawhonic incidents was not checked against the film; the summaries came from Legends pages.

## B2. Batmobile lore (1989 Burton / Batman Returns 1992)

### Takeaway
The 1989 Batmobile had side-mounted grappling hooks (used to make sharp turns), a central "foot" that lifts and turns the car, an armour cocoon (deployed when stationary), forward machine guns, bomb dispensers, disc launchers, oil-slick dispensers and smoke emitters. *Batman Returns* (1992) added the rotating base platform and the "Batmissile" mode, in which the car sheds its outer panels to become a narrow rocket shape.

### Cited Findings
- 1989 Batmobile: side-mounted grappling hook launchers, a central "foot" that could lift the car and turn it around, and a heavy armour cocoon that could be deployed while the car was stationary. — [Batman Wiki: Batmobile (Burtonverse)](https://batman.fandom.com/wiki/Batmobile_(Burtonverse)) (via search summary; direct fetch blocked)
- Arsenal: disc launchers, bomb dispensers and forward machine guns. — [Greg Wapling: Batmobile show car](https://hotrod.gregwapling.com/show-cars/batmobile.htm)
- Oil-slick dispensers and smoke emitters. — [BatmobileHistory.com: Batmobiles 1989–1992](https://www.batmobilehistory.com/1989-batmobile.php)
- *Batman Returns*: a retractable rotating platform in the base let the car lift and spin in place. The "Batmissile" was an ejectable escape mode in which the car shed its outer panels and narrowed its wheelbase into a rocket shape. — [TechRadar: The evolution of the Batmobile](https://www.techradar.com/news/video/evolution-of-the-batmobile-1300731)
- Anton Furst's team designed the original Batmobile. The Batmissile feature was added for *Returns*. — [Wikipedia: Special effects of Batman Returns](https://en.wikipedia.org/wiki/Special_effects_of_Batman_Returns)
- Sources disagree on gadget counts and some details. — [TechRadar](https://www.techradar.com/news/video/evolution-of-the-batmobile-1300731); [BatmobileHistory](https://www.batmobilehistory.com/1989-batmobile.php)

### Inferences
- **Item ideas:** "Grapple Turn" (fire a hook to a track-side anchor for a zero-loss hairpin), "Armour Cocoon" (a temporary invulnerability shield; in the film it was used while parked, so it could make the car slow but immune), "Oil Slick" and "Smoke Screen" (rear-dropped hazards), "Bat-Bombs" (dropped mines), "Batdisc" (forward projectile), "Batmissile" (a narrow-body rocket boost that squeezes through gaps), "Spin Platform" (an instant 180° turn).
- The 1989 car's jet-turbine afterburner is a natural boost item (see Gaps; not sourced here).

### Gaps
- **Caltrops:** I found no source showing the Burton Batmobile dropping caltrops. They appear in other Batmobile media from general knowledge (e.g. the 1960s TV car, the Tumbler), but this is unverified.
- The afterburner or jet-turbine detail of the 1989 car was not confirmed in the fetched sources, though it is widely known.

## B3. Speed Racer Mach 5 steering-wheel buttons A–G

### Takeaway
All sources agree: A = Auto Jacks, B = Belt Tires (grip tread, with power to all four wheels), C = Cutter (rotary saws), D = Deflector (bulletproof, crash-proof sealed canopy), E = Evening Eye (infrared/illumination headlights, later modified to deploy mini-wings for jumps), F = Frogger (underwater mode, with oxygen and periscope), G = Go/homing robot (a bird-shaped drone released from the nose).

### Cited Findings
- A: jacks that lift the car for servicing. Fans note they were also used to jump short distances. — [Jalopnik: A guide to the buttons on the Mach 5 steering wheel](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068); [Speed Racer Wiki: Mach 5](https://speedracer.fandom.com/wiki/Mach_5?oldid=5677)
- B: high-traction tread on the tires, with 5,000 hp distributed to all four wheels. — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068); [Speed Racer Wiki](https://speedracer.fandom.com/wiki/Mach_5?oldid=5677)
- C: a pair of spinning circular saws at the front for cutting down trees and other obstacles. — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068)
- D: deploys a clear, durable canopy over the cockpit. The wiki describes it as a bulletproof, crash-proof, air- or watertight chamber. — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068); [Speed Racer Wiki](https://speedracer.fandom.com/wiki/Mach_5?oldid=5677)
- E: special headlights with a scanning infrared beam, for seeing farther than ordinary headlights. It was later modified to deploy mini-wings for long jumps (Pops got the idea from a car acrobatic team). — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068); [Speed Racer Wiki](https://speedracer.fandom.com/wiki/Mach_5?oldid=5677)
- F: underwater "sub" mode, with oxygen supplied to the cockpit, a periscope raised and a camera feed on the dash. — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068); [Speed Racer Wiki](https://speedracer.fandom.com/wiki/Mach_5?oldid=5677)
- G: the largest, central button. It releases a "homing robot", a bird-shaped drone, from the front of the car. — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068)
- The Mach 5 was built by Mifune Motors (Jalopnik's framing of the animated series). — [Jalopnik](https://jalopnik.com/finally-heres-a-guide-to-those-buttons-on-speed-racers-1844768068)

### Inferences
- **Item ideas:** "Auto Jacks" (a hop over hazards or projectiles; maps neatly to a jump), "Grip Tires" (no slowdown off-road, e.g. on Rohan grass or the Dead Marshes), "Cutter Blades" (a ram attack that destroys obstacles and spins out karts in front), "Deflector" (a projectile shield), "Evening Eye" (headlights that reveal hidden traps or cloaked racers, or cut through Mordor's darkness), "Frogger" (no penalty in water, e.g. Dead Marshes or river sections), "Homing Robot G" (a homing projectile, like a red shell).
- The Mach 5 alone could plausibly carry a full seven-item set based on its lettered gadgets.

### Gaps
- The 2008 Wachowskis film version of the Mach 5 (and whether it keeps the A–G functions) was not researched.
- Names vary by source: E is called "Evening Eye" or "Illumination", F "Frogger mode", G "Go" or "Gizmo". The original Japanese (Mach GoGoGo) naming was not checked.

## B4. Lord of the Rings film moments usable as items

### Takeaway
Several iconic film moments were confirmed in this pass: the dragon firework (set off by Merry and Pippin, not Gandalf, in the film), the Phial of Galadriel ("a light to you in dark places"), Gimli sounding the Horn of Helm Hammerhand at Helm's Deep, Gandalf arriving at dawn on Shadowfax, Sam's elven rope (extended edition), and the elven cloak hiding Frodo and Sam at the Black Gate (a film-only scene). The rest of the requested list are well-known film moments, but they were not individually sourced here (see Gaps).

### Cited Findings
- **Dragon firework** (*Fellowship of the Ring*, Bilbo's party): in the film, Merry and Pippin set off one of Gandalf's fireworks by accident. It takes the shape of a dragon and explodes over the water. In the book, Gandalf sets it off himself. — [TheOneRing.com: complete list of film changes (FotR)](https://www.theonering.com/complete-list-of-film-changes/the-fellowship-of-the-ring/)
- **Phial of Galadriel:** Galadriel gives it to Frodo when the Fellowship leaves Lothlórien, saying "May it be a light to you in dark places, when all other lights go out." — [Wikipedia: Phial of Galadriel](https://en.wikipedia.org/wiki/Phial_of_Galadriel)
- **Horn of Helm Hammerhand** (*The Two Towers*): Gimli sounds it as the remaining defenders ride out from the keep at Helm's Deep. — [LOTR Wiki: Battle of the Hornburg](https://lotr.fandom.com/wiki/Battle_of_the_Hornburg); [Sideshow: Top 10 Helm's Deep moments](https://www.sideshow.com/blog/top-10-helms-deep-moments-lotr-the-two-towers)
- **Gandalf at dawn:** he appears at first light on the fifth day, on Shadowfax on the hilltop ("Look to my coming at first light on the fifth day… look to the east"). — [Age of the Ring: TTT EE script scenes 57–60](https://www.ageofthering.com/atthemovies/scripts/thetwotowers57to60.php)
- **Elven rope** (Emyn Muil, extended edition of *The Two Towers* only): Frodo and Sam descend a cliff with the rope Galadriel gave Sam. The knot comes loose with one tug, prompting "Real Elvish rope." — [Tolkien Gateway: Elven Rope (scene)](https://tolkiengateway.net/wiki/Elven_Rope_(scene))
- **Elven cloak at the Black Gate:** in the film, Frodo throws his elven cloak over himself and Sam, and the passing soldiers don't see them. The book has no equivalent scene. — [Tolkien Gateway: Elven cloaks](https://tolkiengateway.net/wiki/Elven_cloaks); [mechtild LiveJournal commentary](https://mechtild.livejournal.com/66140.html)
- **Nazgûl shriek / fell beasts over the Dead Marshes:** only a weak source was found (a fan walkthrough noting "when the Nazgûl shrieks, get down"). — [GitHub PR (fan project)](https://github.com/tilakpatell/new-portfolio-website/pull/97). Low-quality source.

### Inferences
- **Item ideas (verified moments):** "Dragon Firework" (a big forward homing rocket with a dragon trail; very iconic), "Phial of Galadriel" (a light burst that blinds or slows nearby racers, or reveals hidden or cloaked karts; strong for Moria and Shelob-like dark sections), "Horn of Helm Hammerhand" (an AoE shockwave that knocks back nearby karts, or a team-wide speed buff "charge"), "Shadowfax at Dawn" (a catch-up boost for last place), "Elven Cloak" (temporary invisibility on the TV: a semi-transparent kart that homing items can't target), "Elven Rope" (a grapple to swing round a corner or get pulled back onto the track after falling off).
- **Popular film moments (unsourced here; verify before using lore text):** "You shall not pass" staff strike on the Bridge of Khazad-dûm (a barrier that blocks pursuers), the One Ring (invisibility, but the Eye of Sauron hunts the wearer, a risk/reward item), the Nazgûl shriek (fear: reverses or jitters opponents' steering), the Morgul blade (a lingering slow-poison debuff), the Great Eagles (rescue or lift-ahead for last place), the Army of the Dead (a green ghost wave sweeping the track), the beacons of Gondor (a chain of track-side flames that boosts whoever passes), oliphaunts (a rolling or stomping track hazard), Minas Tirith trebuchets and catapults (indirect lobbed artillery like a Bob-omb), Grond (a heavy forward ram), the Balrog whip (a lasso that pulls the leader back), Watcher in the Water tentacles (a puddle trap that grabs karts), Gollum (a thief that steals another player's item, "my precious"), Shelob web (a sticky rear trap), the mithril vest (a one-hit shield), Andúril (a melee spin), the Witch-king's flail (a swinging melee), Ents and Huorns (trees that move onto the track), lembas (a small heal or boost).
- **Vehicle-themed signature items** could sit alongside generic track items. Disney Speedstorm (below) shows that per-character unique skills drawn from iconic film scenes are an accepted pattern.

### Gaps
- The following were not individually verified with sources in this pass: "You shall not pass", the Ring and Eye mechanics, the Nazgûl shriek, the Morgul blade, fell beasts, Eagles, the Army of the Dead, the beacons, oliphaunts, trebuchets, Grond, the Balrog whip, the Watcher, Gollum, Shelob, the mithril vest (Moria cave troll scene), Andúril and the Witch-king's flail. They are well-known film scenes, but each needs a citation (e.g. Tolkien Gateway or the Wikipedia film plot pages) before it is used in a factual lore blurb.

## B5. Precedent: licensed / movie kart racers using film gadgets as items

### Takeaway
Disney Speedstorm is the clearest current precedent. It has generic shared skills (Boost, Hack, Bomb, Fire, Shield, Rush, Cloak, Shot) plus a per-character "Unique Skill" drawn from an iconic film moment, many of them with a charged variant.

### Cited Findings
- Disney Speedstorm has Common Skills (Boost, Hack, Bomb, Fire, Shield, Rush, Cloak, Shot) and character-specific Unique Skills, which unlock at racer level 20. — [Twinfinite: Every racer and their unique skill](https://twinfinite.net/guides/every-racer-their-unique-skill-in-disney-speedstorm/); [Speedstorm Wiki: Unique Skills](https://speedstorm.fandom.com/wiki/Skills/Unique_Skills_(S1-10))
- Examples: Mulan's "Firework Barrage" (from the film's finale with Shan Yu), Jack Sparrow's "Cutlass Flurry" (ghostly blades that stun on contact), Sulley's "Mighty Roar" (damages nearby racers), Sam Flynn's thrown Identity Disc (*Tron: Legacy*), Li Shang's staff (thrown forward or spun around him). Many have charged versions, e.g. Lilo surfs and leaves a water trail. — [Game Rant: best unique skills](https://gamerant.com/disney-speedstorm-best-unique-skills-ranked/); [DualShockers](https://www.dualshockers.com/disney-speedstorm-best-skills/); [Twinfinite](https://twinfinite.net/guides/every-racer-their-unique-skill-in-disney-speedstorm/)

### Inferences
- **A two-tier system fits this project.** Generic random pickup items would be themed to the track (LOTR items on the Middle-earth loop). Each vehicle would also get a signature ability on a charge or meter (Pod Racer: flame vent or Scrap Toss; Batmobile: grapple turn or armour cocoon; Nazgûl: shriek or the Ring's call; Mach 5: lettered gadgets, perhaps rotating A–G). This mirrors Speedstorm's Common plus Unique split and keeps the single ITEM button simple. The signature ability could be a hold or charge on the same button, or it could go on DRIFT.

### Gaps
- LEGO Racers, Nickelodeon Kart Racers, Shrek Kart and Star Wars racing titles (Episode I Racer, Star Wars Hunters, etc.) were not researched, because of the tool-call budget.
