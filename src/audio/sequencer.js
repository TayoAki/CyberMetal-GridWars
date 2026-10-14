// Music sequencer. The same Sequencer drives live playback (a lookahead scheduler calls advance()
// every ~25 ms with a ~0.15 s horizon) and offline renders (one advance() over the whole render),
// so the intro/loop logic tested offline is exactly what plays in the game.
import { compileTrack } from './mml.js';
import { playNote, playDrum } from './instruments.js';

const compiledCache = new WeakMap();
export function compiled(def) {
  let c = compiledCache.get(def);
  if (!c) compiledCache.set(def, (c = compileTrack(def)));
  return c;
}

export class Sequencer {
  /**
   * @param ctx   BaseAudioContext
   * @param dest  node to play into (the music bus)
   * @param def   track definition (tracks/*.js)
   * @param t0    context time at which playback starts
   * @param opts  live: drop events that are already late instead of piling them up;
   *              from: start this many seconds into the song (seek); fadeIn: seconds
   */
  constructor(ctx, dest, def, t0, { live = false, from = 0, fadeIn = 0 } = {}) {
    this.ctx = ctx;
    this.live = live;
    this.c = compiled(def);
    this.loop = def.loop !== false;
    this.swing = (def.swing ?? 0) * 6; // ticks to delay off-beat 16ths by
    this.t0 = t0 - from; // context time of song position 0
    this.startAt = t0;
    this.stopped = false;
    this.finished = false;
    this.out = ctx.createGain();
    if (fadeIn > 0) {
      this.out.gain.setValueAtTime(0, t0);
      this.out.gain.linearRampToValueAtTime(1, t0 + fadeIn);
    }
    this.out.connect(dest);
    let echoIn = null;
    if (def.echo) {
      echoIn = ctx.createGain();
      const dl = ctx.createDelay(2);
      dl.delayTime.value = (def.echo.beats * 60) / def.bpm;
      const fb = ctx.createGain();
      fb.gain.value = def.echo.fb ?? 0.3;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = def.echo.lp ?? 2600;
      const wet = ctx.createGain();
      wet.gain.value = def.echo.mix ?? 0.3;
      echoIn.connect(dl);
      dl.connect(lp);
      lp.connect(fb);
      fb.connect(dl);
      lp.connect(wet);
      wet.connect(this.out);
    }
    this.chans = this.c.chans.map((ch) => {
      const bus = ctx.createGain();
      let head = bus;
      if (ch.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = ch.pan;
        bus.connect(p);
        head = p;
      }
      head.connect(this.out);
      if (echoIn && ch.echo) {
        const send = ctx.createGain();
        send.gain.value = ch.echo;
        head.connect(send);
        send.connect(echoIn);
      }
      return { ch, bus, phase: this.c.introTicks > 0 ? 'intro' : 'loop', i: 0, pass: 0, done: false };
    });
  }

  /** Song length to the end of the first pass of the loop body (end of a jingle). */
  get endTime() {
    return this.t0 + this.c.introSec + this.c.loopSec;
  }

  /** True while the track is still sounding (loops always are, until stopped). */
  get playing() {
    if (this.stopped) return false;
    if (this.loop) return true;
    return this.ctx.currentTime < this.endTime + 0.5;
  }

  /** Schedule every event that starts before context time `until`. */
  advance(until) {
    if (this.stopped) return;
    const { spt, introSec, loopSec, loopTicks } = this.c;
    const now = this.live ? this.ctx.currentTime : -Infinity;
    for (const st of this.chans) {
      while (!st.done) {
        const evs = st.phase === 'intro' ? st.ch.intro.events : st.ch.body.events;
        if (st.i >= evs.length) {
          if (st.phase === 'intro') {
            st.phase = 'loop';
            st.i = 0;
            continue;
          }
          if (this.loop && loopTicks > 0 && evs.length) {
            st.pass++;
            st.i = 0;
            continue;
          }
          st.done = true;
          break;
        }
        const ev = evs[st.i];
        const base = st.phase === 'intro' ? this.t0 : this.t0 + introSec + st.pass * loopSec;
        const at = base + (ev.tick + (ev.tick % 12 === 6 ? this.swing : 0)) * spt;
        if (at >= until) break;
        st.i++;
        if (at < this.startAt - 1e-6) continue; // seeking past it
        if (at < now - 0.04) continue; // far too late (main thread stalled): drop, don't pile up
        this.fire(st, ev, Math.max(at, now));
      }
    }
    this.finished = this.chans.every((s) => s.done);
  }

  fire(st, ev, at) {
    const ch = st.ch;
    const vol = ch.vol ?? 1;
    if (ch.drum) for (const d of ev.drums) playDrum(this.ctx, st.bus, d, at, (vol * ev.vol) / 12);
    else playNote(this.ctx, st.bus, ev, at, this.c.spt, vol, ev.inst || ch.inst);
  }

  /** Fade out over `fade` seconds and stop scheduling. */
  stop(fade = 0.25) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    if (this.live) {
      setTimeout(() => {
        try {
          this.out.disconnect();
        } catch {
          /* already gone */
        }
      }, (fade + 0.3) * 1000);
    }
  }
}
