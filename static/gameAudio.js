// gameAudio.js
export const GameAudio = (() => {
    let ctx, master, musicBus, sfxBus;
    const _buffers = new Map();            // path -> AudioBuffer
    const _playing = new Map();            // id -> state object
    const _timers = new Map();             // id -> Set(timeoutIds) for crossfade engine
    let _idCounter = 0;
  
    const _now = () => ctx.currentTime;
    const _newId = () => Symbol(`snd_${++_idCounter}`);
    const _bus = (cat) => (cat === 'music' ? musicBus : sfxBus);
  
    // ---------- setup ----------
    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(ctx.destination);
      master.gain.value = musicBus.gain.value = sfxBus.gain.value = 1;
      console.log('[GameAudio] ready');
    }
    async function resume() { if (ctx && ctx.state !== 'running') await ctx.resume(); }
  
    async function _load(path) {
      if (_buffers.has(path)) return _buffers.get(path);
      const res = await fetch(path);
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      _buffers.set(path, buf);
      return buf;
    }
  
    function _fadeIn(gain, to, secs) {
      const t = _now();
      if (secs > 0) {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(to, t + secs);
      } else {
        gain.gain.setValueAtTime(to, t);
      }
    }
    function _fadeOut(gain, secs) {
      const t = _now();
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      if (secs > 0) gain.gain.linearRampToValueAtTime(0, t + secs);
      else gain.gain.setValueAtTime(0, t);
    }
  
    function _trackTimer(id, tid) {
      if (!_timers.has(id)) _timers.set(id, new Set());
      _timers.get(id).add(tid);
    }
    function _clearTimers(id) {
      const set = _timers.get(id);
      if (!set) return;
      for (const tid of set) clearTimeout(tid);
      _timers.delete(id);
    }
  
    // ---------- PUBLIC: play (immediate return) ----------
    // Returns immediately: { id, audioLength }
    async function playSound(path, opts = {}) {
      const {
        category = 'sfx',
        loop = false,
        fadeIn = 0,
        fadeOut = 0,        // used when stopped
        crossfade = 0,      // >0 enables seamless loop crossfade
        volume = 1.0,
        pitch = 1.0,        // 1.0 = neutral
        randPitch = 0.0,    // +/- range added to pitch
        rate = 1.0,         // speed (affects pitch naturally)
        startAt = 0,
        onended = null,
      } = opts;
  
      await resume();
      const buffer = await _load(path);
  
      // compute final pitch
      const rp = randPitch > 0 ? (Math.random() * 2 - 1) * randPitch : 0;
      const finalPitch = pitch + rp;
  
      // create first voice
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.detune.value = (finalPitch - 1) * 1200;
      src.connect(gain).connect(_bus(category));
  
      const id = _newId();
      const audioLength = buffer.duration / rate;
  
      const state = {
        id, category, buffer, rate, volume, detune: (finalPitch - 1) * 1200,
        fadeOut, crossfade,
        _voices: [{src, gain}], // active last voice
        _resolve: null,         // for wait()
        _looping: loop,
        _stopped: false,
      };
      _playing.set(id, state);
  
      _fadeIn(gain, volume, fadeIn);
      src.start(_now(), startAt);
  
      // --- automatic fade-out before natural end (only if not looping) ---
      if (!loop && fadeOut > 0) {
        const endTime = _now() + (buffer.duration / rate);
        const fadeStart = Math.max(_now(), endTime - fadeOut);
        gain.gain.setValueAtTime(volume, fadeStart);
        gain.gain.linearRampToValueAtTime(0, endTime);
      }
  
  
      // non-crossfade, non-loop: resolve on end
      if (!loop || crossfade <= 0) {
        src.onended = () => {
          if (state._stopped) return; // already stopped manually
          _playing.delete(id);
          if (typeof onended === 'function') { try { onended(); } catch {} }
          if (state._resolve) state._resolve({ id, audioLength });
        };
        // enable simple native loop (no crossfade) if loop==true and crossfade==0
        if (loop && crossfade <= 0) {
          src.loop = true;
        }
        return { id, audioLength };
      }
  
      // ----------- Crossfade loop engine (2-voice ping-pong) -----------
      // We alternate A/B voices, pre-scheduling the next start at absolute
      // AudioContext times while creating nodes a short moment beforehand.
  
      const overlap = Math.min(crossfade, Math.max(0.05, audioLength * 0.9)); // clamp sanity
      const period = audioLength - overlap; // time between starts
      let nextStartAbs = _now() + period;   // first crossfade start time
      let nextIs = 1; // next voice index (0/1)
  
      function scheduleNextCycle() {
        if (state._stopped || !_playing.has(id)) return;
  
        // create next voice slightly ahead of start time
        const createLeadMs = 60; // create node ~60ms before start time
        const delayMs = Math.max(0, (nextStartAbs - _now()) * 1000 - createLeadMs);
  
        const tid = setTimeout(() => {
          if (state._stopped || !_playing.has(id)) return;
  
          const nextSrc = ctx.createBufferSource();
          const nextGain = ctx.createGain();
          nextSrc.buffer = buffer;
          nextSrc.playbackRate.value = rate;
          nextSrc.detune.value = state.detune;
          nextSrc.connect(nextGain).connect(_bus(category));
  
          // get current active voice (the last one we created)
          const prev = state._voices[state._voices.length - 1];
  
          // program fades at absolute times
          nextGain.gain.setValueAtTime(0, nextStartAbs);
          nextGain.gain.linearRampToValueAtTime(volume, nextStartAbs + overlap);
          prev.gain.gain.setValueAtTime(volume, nextStartAbs);
          prev.gain.gain.linearRampToValueAtTime(0, nextStartAbs + overlap);
  
          // start/stop
          nextSrc.start(nextStartAbs);
          // stop previous a hair after fade to ensure cut
          try { prev.src.stop(nextStartAbs + overlap + 0.02); } catch {}
  
          // track new as active
          state._voices.push({src: nextSrc, gain: nextGain});
          // keep only last 2 entries to avoid growth
          if (state._voices.length > 2) state._voices.shift();
  
          // compute next cycle's absolute start time
          nextStartAbs += period;
  
          // schedule another cycle
          scheduleNextCycle();
        }, delayMs);
  
        _trackTimer(id, tid);
      }
  
      // kick the engine
      scheduleNextCycle();
  
      // NOTE: for crossfade loops, wait() will never resolve unless stopped.
      return { id, audioLength };
    }
  
    // ---------- Await helpers ----------
    // Promise that resolves when the (non-loop) sound finishes; loops resolve when stopped.
    function wait(id) {
      const st = _playing.get(id);
      if (!st) return Promise.resolve({ id, audioLength: 0 });
      return new Promise((resolve) => {
        st._resolve = resolve;
        // If it already ended (rare race), resolve immediately:
        // We could detect by missing voice src, but safe to leave as-is.
      });
    }
  
    // convenience: play and await completion in one line
    async function playSoundAndWait(path, opts = {}) {
      const { id, audioLength } = await (async () => playSound(path, opts))();
      // If it’s a simple (non-crossfade) one-shot, wait() will resolve on end;
      // If it’s loop or crossfade loop, it will only resolve when stopped.
      return wait(id).then(() => ({ id, audioLength }));
    }
  
    // ---------- Stops ----------
    function stopSound(id, fade = 0) {
      const st = _playing.get(id);
      if (!st) return;
      st._stopped = true;
  
      // cancel crossfade engine timers
      _clearTimers(id);
  
      // fade + stop all active voices
      for (const v of st._voices) {
        _fadeOut(v.gain, fade);
        try { v.src.stop(_now() + Math.max(0, fade) + 0.01); } catch {}
      }
  
      _playing.delete(id);
      if (st._resolve) st._resolve({ id, audioLength: st.buffer.duration / st.rate });
    }
  
    function stopAllSound(category = 'all', fade = 0) {
      const ids = [..._playing.keys()];
      for (const id of ids) {
        const st = _playing.get(id);
        if (!st) continue;
        if (category === 'all' || st.category === category) stopSound(id, fade);
      }
    }
  
    // ---------- Masters ----------
    function setMaster(category, value, fade = 0) {
      const bus = category === 'music' ? musicBus :
                  category === 'sfx'   ? sfxBus   : master;
      const t = _now();
      bus.gain.cancelScheduledValues(t);
      if (fade > 0) bus.gain.linearRampToValueAtTime(value, t + fade);
      else bus.gain.setValueAtTime(value, t);
    }
  
    return {
      init, resume,
      playSound, playSoundAndWait, wait,
      stopSound, stopAllSound,
      setMaster
    };
  })();
  