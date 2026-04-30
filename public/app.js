

const PROFILES = [
  { id: "deep-work", name: "Deep Focus",   band: "Beta",  freqRange: "14\u201330 Hz", carrierHz: 200, freqHz: 20, ambientType: "brown" },
  { id: "flow",      name: "Flow State",  band: "Alpha", freqRange: "8\u201313 Hz",  carrierHz: 200, freqHz: 10, ambientType: "pink"  },
  { id: "study",     name: "Study & Memory", band: "Gamma", freqRange: "40 Hz",      carrierHz: 200, freqHz: 40, ambientType: "brown" },
  { id: "adhd",      name: "ADHD Ultra",       band: "Gamma", freqRange: "40 Hz",         carrierHz: 210, freqHz: 40, ambientType: "brown" },
  { id: "calm",      name: "Calm",  band: "Theta", freqRange: "4\u20137 Hz",   carrierHz: 200, freqHz: 6,  ambientType: "pink"  },
];


const OVERLAYS = [
  { id: "Nocturne",          label: "Piano",         file: "/sounds/Nocturne.mp3" },
  { id: "Moonlight",         label: "Piano 2",       file: "/sounds/Moonlight.mp3" },
  { id: "Fantasia",         label: "Piano 3",       file: "/sounds/Fantasia.mp3" },
  { id: "Symphony No. 7",          label: "Chords",         file: "/sounds/SymphonyNo7.mp3" },
  { id: "Serenade",           label: "Strings",          file: "/sounds/Serenade.mp3" },
  { id: "Badinerie",  label: "Woodwinds",       file: "/sounds/Badinerie.mp3" },
  { id: "custom",         label: "Custom upload", file: null, custom: true },
  { id: "none",           label: "None",          file: null },
];

// ----- noise generators  -----

function makeBrown(ctx) {
  const sr = ctx.sampleRate;
  const length = sr * 8;
  const buffer = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * w) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
  }
  return buffer;
}

function makePink(ctx) {
  const sr = ctx.sampleRate;
  const length = sr * 8;
  const buffer = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969   * b2 + w * 0.153852;
      b3 = 0.8665  * b3 + w * 0.3104856;
      b4 = 0.55    * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buffer;
}

// ----- player  -----

function createPlayer() {
  let ctx = null;
  let cleanups = [];
  let nodes = null;
  let masterGain = null;
  let sessionId = 0;
  // User-uploaded loop. Persists across play/stop so the user doesn't have to
  // re-pick the file every session.
  let customBuffer = null;
  let customSource = null;
  let customGain = null;

  const ensureCtx = () => {
    if (!ctx || ctx.state === "closed") ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  const stop = () => {
    cleanups.forEach((fn) => { try { fn(); } catch {} });
    cleanups = [];
    nodes = null;
    masterGain = null;
    customSource = null;
    customGain = null;
  };

  const resumeIfSuspended = async () => {
    if (!ctx || ctx.state === "closed") return false;
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {}
    return ctx.state === "running";
  };

  // Decode an arbitrary audio File/Blob/ArrayBuffer into a reusable buffer.
  // Stored on the player; if currently playing it's hot-swapped into the
  // already-wired custom GainNode so the user hears it immediately.
  const setCustomBuffer = async (fileOrBuffer) => {
    const c = ensureCtx();
    const arrayBuf = fileOrBuffer instanceof ArrayBuffer
      ? fileOrBuffer
      : await fileOrBuffer.arrayBuffer();
    // decodeAudioData detaches the buffer in some engines, so clone first.
    const decoded = await c.decodeAudioData(arrayBuf.slice(0));
    customBuffer = decoded;
    if (nodes && customGain) {
      if (customSource) { try { customSource.stop(); } catch {} }
      const src = c.createBufferSource();
      src.buffer = decoded;
      src.loop = true;
      src.connect(customGain);
      src.start();
      customSource = src;
      cleanups.push(() => { try { src.stop(); } catch {} });
    }
    return decoded;
  };

  const clearCustomBuffer = () => {
    customBuffer = null;
    if (customSource) { try { customSource.stop(); } catch {} customSource = null; }
  };

  // play(profile, vols, opts?) where vols is an object with keys matching
  // OVERLAYS ids plus binaural/iso/ambient. Mirrors the play() positional arg
  // order. `opts.ambientType` (`"pink"` | `"brown"`) overrides the profile's
  // default ambient type without changing any other profile parameter.
  const play = (profile, vols, opts = {}) => {
    stop();
    const c = ensureCtx();
    const dest = c.destination;
    const cleanup = [];
    const sid = ++sessionId;

    // master
    const master = c.createGain();
    master.gain.value = vols.master ?? 1;
    master.connect(dest);
    masterGain = master;

    // ---- Binaural bus ----
    const binBus = c.createGain();
    binBus.gain.value = vols.binaural * 0.151875;
    binBus.connect(master);

    const oscL = c.createOscillator();
    oscL.type = "sine";
    oscL.frequency.value = profile.carrierHz;
    const panL = c.createStereoPanner();
    panL.pan.value = -1;
    oscL.connect(panL).connect(binBus);

    const oscR = c.createOscillator();
    oscR.type = "sine";
    oscR.frequency.value = profile.carrierHz + profile.freqHz;
    const panR = c.createStereoPanner();
    panR.pan.value = 1;
    oscR.connect(panR).connect(binBus);

    oscL.start(); oscR.start();
    cleanup.push(() => { try { oscL.stop(); oscR.stop(); } catch {} });

    // ---- Isochronic bus ----
    const isoBus = c.createGain();
    isoBus.gain.value = vols.iso * 0.10935;
    isoBus.connect(master);

    const isoCarrier = c.createOscillator();
    isoCarrier.type = "sine";
    isoCarrier.frequency.value = 440;

    const isoAmp = c.createGain();
    isoAmp.gain.value = 0;

    const dc = c.createConstantSource();
    dc.offset.value = 0.5;

    const sq = c.createOscillator();
    sq.type = "square";
    sq.frequency.value = Math.max(profile.freqHz, 0.5);

    const sqGain = c.createGain();
    sqGain.gain.value = 0.5;

    dc.connect(isoAmp.gain);
    sq.connect(sqGain);
    sqGain.connect(isoAmp.gain);
    isoCarrier.connect(isoAmp).connect(isoBus);

    dc.start(); sq.start(); isoCarrier.start();
    cleanup.push(() => { try { dc.stop(); sq.stop(); isoCarrier.stop(); } catch {} });

    // ---- Ambient bus ----
    const ambBus = c.createGain();
    ambBus.gain.value = vols.ambient * 0.243;
    ambBus.connect(master);

    const ambientType = opts.ambientType || profile.ambientType;
    const noiseBuf = ambientType === "brown" ? makeBrown(c) : makePink(c);
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    noiseSrc.connect(ambBus);
    noiseSrc.start();
    cleanup.push(() => { try { noiseSrc.stop(); } catch {} });

    // ---- Overlay buses (each its own GainNode, fetched + decoded async) ----
    const overlayGains = {};
    const loadOverlay = (overlay) => {
      if (!overlay.file && !overlay.custom) return;
      const g = c.createGain();
      g.gain.value = vols[overlay.id] || 0;
      g.connect(master);
      overlayGains[overlay.id] = g;

      if (overlay.custom) {
        customGain = g;
        if (customBuffer) {
          const src = c.createBufferSource();
          src.buffer = customBuffer;
          src.loop = true;
          src.connect(g);
          src.start();
          customSource = src;
          cleanup.push(() => { try { src.stop(); } catch {} });
        }
        return;
      }

      fetch(overlay.file)
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((decoded) => {
          if (sid !== sessionId) return; // stale
          const src = c.createBufferSource();
          src.buffer = decoded;
          src.loop = true;
          src.connect(g);
          src.start();
          cleanup.push(() => { try { src.stop(); } catch {} });
        })
        .catch((e) => console.warn("overlay load failed:", overlay.id, e));
    };
    OVERLAYS.forEach(loadOverlay);

    nodes = {
      setBinaural: (v) => binBus.gain.setTargetAtTime(v * 0.151875, c.currentTime, 0.1),
      setIso:      (v) => isoBus.gain.setTargetAtTime(v * 0.10935, c.currentTime, 0.1),
      setAmbient:  (v) => ambBus.gain.setTargetAtTime(v * 0.243,   c.currentTime, 0.1),
      setOverlay:  (id, v) => {
        const g = overlayGains[id];
        if (g) g.gain.setTargetAtTime(v, c.currentTime, 0.2);
      },
      setMaster:   (v) => master.gain.setTargetAtTime(v, c.currentTime, 0.05),
    };
    cleanups = cleanup;
    return nodes;
  };

  return {
    play,
    stop,
    resumeIfSuspended,
    isPlaying: () => nodes !== null,
    setCustomBuffer,
    clearCustomBuffer,
    hasCustomBuffer: () => customBuffer !== null,
    update: (vols) => {
      if (!nodes) return;
      nodes.setBinaural(vols.binaural);
      nodes.setIso(vols.iso);
      nodes.setAmbient(vols.ambient);
      nodes.setMaster(vols.master ?? 1);
      OVERLAYS.forEach((o) => {
        if (o.file || o.custom) nodes.setOverlay(o.id, vols[o.id] || 0);
      });
    },
  };
}

// ----- UI wiring -----

const state = {
  profileId: "study",
  binaural: 0.35,
  iso: 0.35,
  ambient: 0.35,
  master: 1,
  overlay: "Nocturne",
  overlayVol: 0.8,
  ambientOverride: null, // null => follow profile; "pink" or "brown" otherwise
};

const AMBIENT_OPTIONS = [
  { id: null,     label: "Auto (profile default)" },
  { id: "pink",   label: "Pink"  },
  { id: "brown",  label: "Brown" },
];

const player = createPlayer();

const profileButtons = document.getElementById("profileButtons");
const profileInfo    = document.getElementById("profileInfo");
const overlayButtons = document.getElementById("overlayButtons");
const overlayPill    = document.getElementById("overlayPill");
const ambientButtons = document.getElementById("ambientButtons");
const ambientInfo    = document.getElementById("ambientInfo");
const playBtn        = document.getElementById("play");
const stopBtn        = document.getElementById("stop");
const statusEl       = document.getElementById("status");
const customFile     = document.getElementById("customFile");
const customName     = document.getElementById("customName");
const customClear    = document.getElementById("customClear");

function renderProfiles() {
  profileButtons.innerHTML = "";
  PROFILES.forEach((p) => {
    const b = document.createElement("button");
    b.textContent = `${p.name} \u00b7 ${p.band}`;
    b.className = p.id === state.profileId ? "active" : "";
    b.onclick = () => {
      state.profileId = p.id;
      renderProfiles();
      renderAmbient();
      if (player.isPlaying()) {
        player.play(currentProfile(), volsObject(), playOpts());
      }
    };
    profileButtons.appendChild(b);
  });
  const p = currentProfile();
  profileInfo.textContent = `carrier ${p.carrierHz} Hz \u00b7 beat ${p.freqHz} Hz \u00b7 ${p.band} (${p.freqRange}) \u00b7 default ambient: ${p.ambientType}`;
}

function renderAmbient() {
  ambientButtons.innerHTML = "";
  AMBIENT_OPTIONS.forEach((o) => {
    const b = document.createElement("button");
    b.textContent = o.label;
    b.className = o.id === state.ambientOverride ? "active" : "";
    b.onclick = () => {
      state.ambientOverride = o.id;
      renderAmbient();
      // Ambient type is baked into the buffer at start, so re-build the graph.
      if (player.isPlaying()) player.play(currentProfile(), volsObject(), playOpts());
    };
    ambientButtons.appendChild(b);
  });
  const eff = effectiveAmbientType();
  const src = state.ambientOverride ? "override" : "profile default";
  ambientInfo.textContent = `current: ${eff} (${src})`;
}

function renderOverlays() {
  overlayButtons.innerHTML = "";
  OVERLAYS.forEach((o) => {
    const b = document.createElement("button");
    b.textContent = o.label;
    b.className = o.id === state.overlay ? "active" : "";
    // Visually mark Custom as disabled-looking until a file is loaded; still
    // selectable so the user can pre-pick it before uploading.
    if (o.custom && !player.hasCustomBuffer()) b.style.opacity = "0.6";
    b.onclick = () => {
      state.overlay = o.id;
      renderOverlays();
      overlayPill.textContent = o.id;
      if (player.isPlaying()) player.update(volsObject());
    };
    overlayButtons.appendChild(b);
  });
  overlayPill.textContent = state.overlay;
}

function currentProfile() {
  return PROFILES.find((p) => p.id === state.profileId);
}

function effectiveAmbientType() {
  return state.ambientOverride || currentProfile().ambientType;
}

function playOpts() {
  return { ambientType: effectiveAmbientType() };
}

function volsObject() {
  // Each overlay gain is its raw vol if currently selected, else 0.
 
  const vols = {
    binaural: state.binaural,
    iso: state.iso,
    ambient: state.ambient,
    master: state.master,
  };
  OVERLAYS.forEach((o) => {
    if (!o.file && !o.custom) return;
    vols[o.id] = state.overlay === o.id ? state.overlayVol : 0;
  });
  return vols;
}

function fmtPct(v) {
  return Math.round(v * 100) + "%";
}

function bindSlider(id, key, label) {
  const el = document.getElementById(id);
  const lbl = document.getElementById(label);
  el.addEventListener("input", () => {
    const v = parseFloat(el.value);
    state[key] = v;
    lbl.textContent = fmtPct(v);
    if (player.isPlaying()) player.update(volsObject());
  });
}
bindSlider("binVol",    "binaural",    "binVal");
bindSlider("isoVol",    "iso",         "isoVal");
bindSlider("ambVol",    "ambient",     "ambVal");
bindSlider("masterVol", "master",      "masterVal");
bindSlider("ovVol",     "overlayVol",  "ovVal");

function applyPlayingUi() {
  playBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "playing \u2014 " + currentProfile().name;
}

playBtn.addEventListener("click", () => {
  player.play(currentProfile(), volsObject(), playOpts());
  applyPlayingUi();
});

stopBtn.addEventListener("click", () => {
  player.stop();
  playBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = "stopped";
});

customFile.addEventListener("change", async () => {
  const f = customFile.files && customFile.files[0];
  if (!f) return;
  customName.textContent = `decoding \u2014 ${f.name}\u2026`;
  customClear.disabled = true;
  try {
    const buf = await player.setCustomBuffer(f);
    const dur = buf.duration.toFixed(2);
    customName.textContent = `${f.name}  \u00b7  ${dur}s loop  \u00b7  ${buf.sampleRate} Hz  \u00b7  ${buf.numberOfChannels}ch`;
    customClear.disabled = false;
    state.overlay = "custom";
    renderOverlays();
    overlayPill.textContent = state.overlay;
    if (player.isPlaying()) player.update(volsObject());
  } catch (err) {
    console.error(err);
    customName.textContent = `failed to decode: ${err.message || err}`;
    customClear.disabled = !player.hasCustomBuffer();
  }
});

customClear.addEventListener("click", () => {
  player.clearCustomBuffer();
  customFile.value = "";
  customName.textContent = "no file loaded \u2014 supported: mp3 / wav / ogg / m4a / flac";
  customClear.disabled = true;
  renderOverlays();
});

renderProfiles();
renderOverlays();
renderAmbient();

