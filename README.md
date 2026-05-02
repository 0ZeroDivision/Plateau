# Plateau

Stabilize your flow state with a focus enhancing synth based on cutting edge [cognitive research](#research).
It is more than just a white noise generator, it uses a spectrum of specialized frequencies that help drown out ambient distractions and keep you on task.

Tune the frequencies to your preference and let it run in the backround. You can overaly music in another tab or in the built-in player.

Run locally or on our web instance: https://plateau-player.vercel.app/

## Run

```bash
node server.js
# open http://localhost:5173
```

(Optional) `PORT=8080 node server.js` to use a different port.

No npm install needed — the server is zero-dependency Node.js.




| Layer      | Algorithm                                                                                          | Bus gain       |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------- |
| Binaural   | sine `carrierHz` panned hard-left, sine `carrierHz+freqHz` panned hard-right                       | vol × 0.151875 |
| Isochronic | 440 Hz sine multiplied by (`ConstantSource(0.5)` + `square(freqHz)*0.5`); freqHz floored at 0.5 Hz | vol × 0.10935  |
| Ambient    | 8-second loop. Pink = Voss-McCartney 7-stage. Brown = `(prev + 0.02·white)/1.02`, scaled ×3.5      | vol × 0.243    |
| Overlay    | pre-recorded loop (`fetch` → `decodeAudioData` → `BufferSource.loop=true`)                         | vol (direct)   |


Profiles:


| ID        | Name           | Band  | carrierHz | freqHz | ambient |
| --------- | -------------- | ----- | --------- | ------ | ------- |
| deep-work | Deep Work      | Beta  | 200       | 20     | brown   |
| flow      | Flow State     | Alpha | 200       | 10     | pink    |
| study     | Study & Memory | Gamma | 200       | 40     | brown   |
| adhd      | ADHD+          | Gamma | 210       | 40     | brown   |
| calm      | Calm Focus     | Theta | 200       | 6      | pink    |


## Files

- `server.js` — zero-dep static file server with HTTP byte-range support (audio streaming).
- `public/index.html` — minimal UI: profile picker, layer sliders, overlay picker.
- `public/app.js` — the synthesis engine.
- `public/sounds/*` — overlay loops downloaded from public domain repositories.

## Notes

- Volume scaling factors (`0.151875`, `0.10935`, `0.243`) are the magic numbers from the bundle — they're what the site uses to keep the synth layers below clipping when stacked with overlays.
- `setTargetAtTime` time-constants (0.1 / 0.2 / 0.05).
- Use stereo headphones — binaural beats only work with channel separation.

## Extra Features

- **Master volume goes to 4×.** On laptop speakers 1.0 only delivers ~70% of full output, so the slider is allowed up to 4× as a digital boost (Web Audio `GainNode` has no hardcoded ceiling — values >1 amplify, with the usual risk of clipping if the underlying signal gets pushed past full-scale).
- **Ambient noise override.** Each profile has a default ambient type (`pink` or `brown`); a UI control now lets you force the other regardless of profile.
- All sliders display as percentages.
- **Custom overlay upload.** The "Custom upload" slot in the overlay row plus the file picker below it accept any local audio file (mp3/wav/ogg/m4a/flac, anything `decodeAudioData` will eat). The file is decoded into an `AudioBuffer` once and looped exactly like the bundled tracks. The buffer persists across stop/play; if you upload while audio is playing it hot-swaps into the running graph immediately.

# Audio credits:

All audio distributed is in the public domain.

[https://www.classicals.de/](https://www.classicals.de/)

[https://commons.wikimedia.org/wiki/File:Fantasia_in_F_minor_by_Franz_Schubert,*D.940*(Op._posth._103).ogg](https://commons.wikimedia.org/wiki/File:Fantasia_in_F_minor_by_Franz_Schubert,_D.940_(Op._posth._103).ogg)

# Research

https://doi.org/10.1007/s00426-015-0727-0

https://doi.org/10.3389/fpsyt.2015.00070

https://doi.org/10.1186/1744-9081-6-55
