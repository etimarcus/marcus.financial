"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "marcus_ambience_enabled";
const MASTER_LEVEL = 0.22;

export function BackgroundAmbience() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const rainSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const thunderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const scheduleThunder = useCallback(
    (ctx: AudioContext, dest: AudioNode) => {
      const delay = 12000 + Math.random() * 35000;
      thunderTimerRef.current = setTimeout(() => {
        playThunder(ctx, dest);
        scheduleThunder(ctx, dest);
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

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    // Pink noise buffer for rain
    const bufferSize = 2 * ctx.sampleRate;
    const rainBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = rainBuffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = rainBuffer;
    rainSource.loop = true;

    const rainHighpass = ctx.createBiquadFilter();
    rainHighpass.type = "highpass";
    rainHighpass.frequency.value = 400;

    const rainLowpass = ctx.createBiquadFilter();
    rainLowpass.type = "lowpass";
    rainLowpass.frequency.value = 2800;
    rainLowpass.Q.value = 0.7;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.7;

    rainSource.connect(rainHighpass);
    rainHighpass.connect(rainLowpass);
    rainLowpass.connect(rainGain);
    rainGain.connect(master);
    rainSource.start();
    rainSourceRef.current = rainSource;

    scheduleThunder(ctx, master);
  }, [scheduleThunder]);

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
      // Wait for first user gesture to resume — browser autoplay policy
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

      // Also try immediately in case the policy is lenient
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
      if (thunderTimerRef.current) clearTimeout(thunderTimerRef.current);
      const src = rainSourceRef.current;
      if (src) {
        try {
          src.stop();
        } catch {}
      }
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
      title={enabled ? "Mute storm" : "Unmute storm"}
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

function playThunder(ctx: AudioContext, dest: AudioNode) {
  const duration = 2.5 + Math.random() * 3;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Irregular amplitude profile: a sharp initial crack + slower rumble
  const crackDur = 0.15;
  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;
    const crack = t < crackDur ? (1 - t / crackDur) * 1.5 : 0;
    const rumble = Math.exp(-t * 0.7) * (0.5 + 0.5 * Math.sin(t * 3));
    const noise = Math.random() * 2 - 1;
    data[i] = noise * (crack + rumble);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 320;
  lowpass.Q.value = 1.4;

  const gain = ctx.createGain();
  gain.gain.value = 1.6;

  source.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(dest);
  source.start();
}
