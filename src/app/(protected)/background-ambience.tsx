"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "marcus_ambience_enabled";
const MASTER_LEVEL = 0.12;

export function BackgroundAmbience() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupDoneRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) setEnabled(raw === "true");
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
  }, [enabled, loaded]);

  const scheduleBurst = useCallback(
    (ctx: AudioContext, dest: AudioNode) => {
      const delay = 1500 + Math.random() * 5500; // 1.5-7s between bursts
      burstTimerRef.current = setTimeout(() => {
        playBurst(ctx, dest);
        scheduleBurst(ctx, dest);
      }, delay);
    },
    []
  );

  const setupAudio = useCallback(() => {
    if (setupDoneRef.current) return;
    setupDoneRef.current = true;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    ctxRef.current = ctx;

    // Master gain — fades in on enable, out on disable
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    // A light feedback delay gives the birds a sense of space,
    // like they're echoing off trees.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.22;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.22;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.35;

    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);

    // Dry path for chirps goes to both master and the delay input.
    // We expose a single "dest" node that routes to both.
    const chirpBus = ctx.createGain();
    chirpBus.gain.value = 1;
    chirpBus.connect(master);
    chirpBus.connect(delay);

    // Kick off the burst scheduler against the chirp bus
    // Use a custom ref-like shape so scheduleBurst reaches the bus
    scheduleBurst(ctx, chirpBus);
  }, [scheduleBurst]);

  const fadeTo = useCallback((target: number) => {
    const ctx = ctxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
  }, []);

  useEffect(() => {
    if (!loaded) return;

    setupAudio();
    const ctx = ctxRef.current;
    if (!ctx) return;

    const apply = () => {
      fadeTo(enabled ? MASTER_LEVEL : 0);
    };

    if (ctx.state === "suspended") {
      const handler = () => {
        ctx
          .resume()
          .then(apply)
          .catch(() => {});
        document.removeEventListener("click", handler);
        document.removeEventListener("keydown", handler);
        document.removeEventListener("touchstart", handler);
      };
      document.addEventListener("click", handler);
      document.addEventListener("keydown", handler);
      document.addEventListener("touchstart", handler);
      ctx.resume().then(apply).catch(() => {});

      return () => {
        document.removeEventListener("click", handler);
        document.removeEventListener("keydown", handler);
        document.removeEventListener("touchstart", handler);
      };
    }

    apply();
  }, [enabled, loaded, setupAudio, fadeTo]);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  if (!loaded) {
    return <div className="w-4 h-4" aria-hidden />;
  }

  return (
    <button
      onClick={() => setEnabled((v) => !v)}
      aria-label={enabled ? "Mute ambience" : "Unmute ambience"}
      title={enabled ? "Mute birds" : "Unmute birds"}
      className="text-zinc-500 hover:text-zinc-200 transition-colors"
    >
      {enabled ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </button>
  );
}

type ChirpPreset = {
  // Frequency sweep in Hz
  startFreq: number;
  endFreq: number;
  // Duration in seconds
  duration: number;
  // Volume multiplier (0-1)
  level: number;
  // Optional vibrato depth in Hz and frequency in Hz
  vibratoFreq?: number;
  vibratoDepth?: number;
};

// A handful of characterful chirp shapes. Pure sine sweeps with quick
// envelopes — pleasant forest birds rather than noisy squawks.
const CHIRP_PRESETS: ChirpPreset[] = [
  // Sweet high "chip"
  { startFreq: 3400, endFreq: 3900, duration: 0.08, level: 0.55 },
  // Quick descending whistle
  { startFreq: 3000, endFreq: 2400, duration: 0.11, level: 0.5 },
  // Rising tweet
  { startFreq: 2300, endFreq: 3400, duration: 0.14, level: 0.5 },
  // Gentle mid "chip"
  { startFreq: 2700, endFreq: 2900, duration: 0.09, level: 0.45 },
  // Small trill with vibrato
  {
    startFreq: 3100,
    endFreq: 3100,
    duration: 0.22,
    level: 0.4,
    vibratoFreq: 22,
    vibratoDepth: 180,
  },
  // High short chip
  { startFreq: 4100, endFreq: 4500, duration: 0.06, level: 0.35 },
  // Distant lower bird
  { startFreq: 1800, endFreq: 2100, duration: 0.12, level: 0.35 },
];

function playChirp(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  preset: ChirpPreset
) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(preset.startFreq, when);
  osc.frequency.linearRampToValueAtTime(preset.endFreq, when + preset.duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  // Gentle attack then smooth decay — no clicks
  gain.gain.linearRampToValueAtTime(preset.level, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    when + preset.duration + 0.02
  );

  osc.connect(gain);
  gain.connect(dest);

  // Optional vibrato via a second oscillator modulating the main osc freq
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (preset.vibratoFreq && preset.vibratoDepth) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = preset.vibratoFreq;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = preset.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(when);
    lfo.stop(when + preset.duration + 0.05);
  }

  osc.start(when);
  osc.stop(when + preset.duration + 0.05);
}

function playBurst(ctx: AudioContext, dest: AudioNode) {
  // A burst is 1-4 chirps spaced closely, as if one bird is singing a
  // short phrase. ~30% of the time play a "conversation" where a second
  // bird answers.
  const now = ctx.currentTime;
  const primary =
    CHIRP_PRESETS[Math.floor(Math.random() * CHIRP_PRESETS.length)];
  const count = 1 + Math.floor(Math.random() * 4); // 1-4 chirps
  let t = now + 0.02;
  for (let i = 0; i < count; i++) {
    const preset = {
      ...primary,
      // Light randomization so repeated chirps don't sound mechanical
      startFreq: primary.startFreq * (1 + (Math.random() - 0.5) * 0.06),
      endFreq: primary.endFreq * (1 + (Math.random() - 0.5) * 0.06),
      duration: primary.duration * (0.85 + Math.random() * 0.3),
    };
    playChirp(ctx, dest, t, preset);
    t += preset.duration + 0.08 + Math.random() * 0.12;
  }

  // Conversational reply from a different bird
  if (Math.random() < 0.32) {
    const reply =
      CHIRP_PRESETS[Math.floor(Math.random() * CHIRP_PRESETS.length)];
    const replyTime = t + 0.15 + Math.random() * 0.25;
    playChirp(ctx, dest, replyTime, {
      ...reply,
      level: reply.level * 0.7, // slightly quieter = distant
    });
  }
}
