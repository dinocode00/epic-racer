import type { ServerInfo } from '@epic/shared';

/**
 * "How 8-Player Local works": the guide opened from ⚙ Settings (I, or Y on a pad) and from
 * the lobby's 8-Player Local panel. It fills in this laptop's real addresses, so the link to
 * type on the second laptop is right there.
 */

export interface LinkStatus {
  /** 0 on the main laptop, 1 on the second. */
  screen: number;
  /** 8-Player Local switched on (at the main laptop). */
  on: boolean;
  /** Linked with the other laptop right now. */
  linked: boolean;
  /** Round trip to the other laptop in ms (NaN if unknown). */
  rtt: number;
}

/** Plain words for a round-trip time. */
export function linkQuality(rtt: number): string {
  if (!Number.isFinite(rtt)) return 'measuring…';
  const ms = `${Math.max(1, Math.round(rtt))} ms`;
  if (rtt < 12) return `${ms} · excellent`;
  if (rtt < 35) return `${ms} · good`;
  if (rtt < 90) return `${ms} · OK (a cable would be smoother)`;
  return `${ms} · slow: try a network cable`;
}

/** What kind of connection an address is, as far as its number tells. */
function addressKind(a: string): string {
  if (a.startsWith('169.254.')) return 'direct cable';
  if (a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a))
    return 'home network (Wi-Fi or cable to the router)';
  return 'other network';
}

function addresses(info: ServerInfo | null, st: LinkStatus): string {
  if (!info) return "<p>The game server isn't answering, so there are no addresses to show.</p>";
  if (st.screen > 0)
    return `<p>This is the <b>second laptop</b>. Its game comes from the main laptop at <b>${location.host}</b>.</p>`;
  const urls = info.screenUrls ?? [];
  if (!urls.length)
    return "<p>This laptop isn't on a network yet. Join the Wi-Fi (or plug the cable in) and this list fills in.</p>";
  return `<table><tr><th>OPEN THIS ON THE SECOND LAPTOP</th><th>CONNECTION</th></tr>${urls
    .map(
      (u) =>
        `<tr><td><b class="mono">${u.secure ?? u.plain}</b>${
          u.secure ? `<br><small>or ${u.plain}</small>` : ''
        }</td><td>${addressKind(u.address)}</td></tr>`,
    )
    .join('')}</table>`;
}

export function linkHelpHtml(info: ServerInfo | null, st: LinkStatus): string {
  const first = info?.screenUrls?.[0];
  const open = first ? (first.secure ?? first.plain) : 'the address shown below';
  const status = st.linked
    ? `Linked with the ${st.screen ? 'main' : 'second'} laptop · ${linkQuality(st.rtt)}`
    : st.on
      ? st.screen
        ? 'On, waiting for the main laptop'
        : 'On, waiting for the second laptop to open the game'
      : st.screen
        ? 'Off at the main laptop (it turns it on in ⚙ Settings)'
        : 'Off (turn it on in ⚙ Settings)';
  return `<div class="howto link-help">
  <h2>8-PLAYER LOCAL <small class="link-state">${status}</small></h2>
  <section>
    <h3>What it is</h3>
    <p>Two laptops in the same room race <b>one race together</b>: up to 4 players on each,
    8 in all. Each laptop shows split screens for its own players, and every racer is on both
    tracks. AI racers fill any places nobody takes.</p>
  </section>
  <section>
    <h3>Setting it up</h3>
    <ol>
      <li>Start the game on one laptop as usual (the launcher). That's the <b>main laptop</b>:
      it picks the track, laps, AI racers and tournament.</li>
      <li>On the main laptop open <b>⚙ Settings</b> and turn <b>8-Player Local</b> on.</li>
      <li>Put the second laptop on the same network: the same Wi-Fi, or a network cable
      (see <i>Connecting with a cable</i>).</li>
      <li>On the second laptop open Chrome, Edge or Safari and go to <b class="mono">${open}</b>.
      Nothing is installed. The first time, the browser warns that the connection isn't
      private: that's the game's own certificate. Choose <b>Advanced → Proceed</b> (Chrome,
      Edge) or <b>Show Details → visit this website</b> (Safari). The plain
      <span class="mono">http://…:4000</span> address works too, but some browsers only let a
      secure page use Xbox controllers.</li>
      <li>Each laptop shows <b>its own QR code</b>: a phone joins the laptop whose code it
      scans. Xbox controllers and the keyboard join the laptop they're connected to.</li>
      <li>When everyone on both laptops is ready, the race starts on both together.</li>
    </ol>
  </section>
  <section>
    <h3>Why there's no lag</h3>
    <ul>
      <li>Both laptops run the whole race themselves. Only button presses travel between
      them: a few dozen bytes, 60 times a second.</li>
      <li><b>Your own kart answers your controls instantly</b>: nothing on your laptop waits
      for the network.</li>
      <li>The other laptop's karts are predicted from what their players were just doing,
      and put right the moment their real presses arrive: a few thousandths of a second later
      over a cable, a few hundredths over Wi-Fi. Usually you can't see it; on busy Wi-Fi a kart
      from the other laptop can twitch now and then.</li>
      <li>Twice a second the laptops compare a fingerprint of the whole race. If they ever
      disagree, the main laptop sends the right race over.</li>
      <li>Pause, results and tournaments are shared: pausing on either laptop pauses both.</li>
    </ul>
  </section>
  <section>
    <h3>Connecting with a cable</h3>
    <p>Wi-Fi works. A cable makes the link faster and steadier, so the corrections become too
    small to notice.</p>
    <h4>What to get</h4>
    <ul>
      <li>An <b>Ethernet network cable</b> (also sold as a patch cable): <b>Cat 5e or Cat 6</b>,
      with the usual <b>RJ45</b> plugs on both ends. 2 to 5 m (6 to 15 ft) is plenty for one
      room.</li>
      <li>A laptop with no network port (most thin laptops and every recent MacBook) needs a
      <b>USB-C to Ethernet adapter</b> (gigabit), or a USB-A one if it has no USB-C.</li>
    </ul>
    <h4>Way 1: both laptops to the router</h4>
    <p>Plug each laptop into a spare port on your Wi-Fi router. Nothing else changes, and
    phones stay on Wi-Fi.</p>
    <h4>Way 2: one cable straight between the laptops</h4>
    <ul>
      <li>A regular cable is fine: no special "crossover" cable is needed, because any recent
      laptop or adapter sorts the wiring out by itself.</li>
      <li>Keep the main laptop on Wi-Fi as well, so phones can still reach it.</li>
      <li>After about half a minute both laptops give the cable an address starting with
      <b>169.254</b>. On the second laptop, open the main laptop's 169.254 address from the
      list below.</li>
    </ul>
    <h4>Windows</h4>
    <p>The first time, Windows asks whether Node.js may use the network: allow it. A direct
    cable can count as a <i>public</i> network, so tick both Private and Public (or use Way 1).</p>
  </section>
  <section>
    <h3>This laptop's addresses</h3>
    ${addresses(info, st)}
  </section>
  <section>
    <h3>Good to know</h3>
    <ul>
      <li>Two laptops race together. A third one that opens the game runs its own races.</li>
      <li>If the second laptop drops out mid-race, its karts finish on autopilot and it joins
      again at the next race.</li>
      <li>With 8-Player Local off, a second laptop that opens the game just runs races of its
      own.</li>
      <li>Each laptop sets its own graphics quality, so a slower laptop doesn't hold the other
      back.</li>
    </ul>
  </section>
</div>`;
}
