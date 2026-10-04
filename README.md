# browser synth

A small polyphonic synth that runs in Chrome and plays from a MIDI controller, the computer keyboard, or the mouse. Built for a machine that can't run a DAW.

Two detuned saws per voice, a resonant lowpass, an ADSR envelope, and a convolution reverb with a generated impulse. Raw Web Audio and Web MIDI, no audio libraries.

## Run

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build   # static site in dist/
```

Web MIDI only works in Chrome (or Edge), on `https` or `localhost`. Chrome asks for MIDI permission on first load.

## Play

- Computer keyboard, using Ableton's layout: `A S D F G H J K L ;` are white keys and `W E T Y U O P` are black keys. `Z`/`X` change octave and `C`/`V` change velocity. Octave 4 puts middle C on `A`. Note names use scientific pitch (C4 = MIDI 60, which Ableton calls C3).
- MIDI: every connected input plays. CC 64 is sustain and CC 123 is all notes off, unless you map those CCs to a control.
- Map a knob: click **learn** on a control and move a knob or fader. Click **×** to unmap and press `Esc` to cancel. Double-click a slider to reset it.
- Patches: **Save** writes to the selected patch (on **Init** it asks for a name), **Save as…** makes a new one, and choosing **Init** resets to the defaults. "edited" means there are unsaved changes.
- Everything is saved in localStorage: the current settings, the named patches, the MIDI mappings, and the octave and velocity. Patches and mappings are separate, so loading a patch keeps your knob mappings.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
