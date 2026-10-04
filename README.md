# browser synth

A small polyphonic synth that runs in Chrome and plays from a MIDI controller, the computer keyboard, or the mouse. Built for a machine that can't run a DAW.

Two detuned oscillators per voice (saw, square, triangle, or sine, level-matched), a resonant lowpass, an amp envelope, a warm tube-style drive, and a convolution reverb with a generated impulse. Raw Web Audio and Web MIDI, no audio libraries. A large chord readout names what you're holding, using [Tonal](https://github.com/tonaljs/tonal), which is pinned to 6.4.3 because the 6.5.0 package is broken.

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
- Chords: the panel above the keyboard names what you're holding. Pick a **Key** to spell notes for that key and see the Roman numeral on the right. Numerals are measured against the major scale on the tonic in both modes (in A minor, C is ♭III); case shows quality (ii, vii°, viiø7), and figured bass shows inversions (I⁶, V⁶₅, V⁴₂). A single note shows its scale degree. Secondary dominants are named by their target (D7 in C is V7/V).
- Suggest mode (tab in the header) hides the synth controls and shows where the current chord can go, in three columns: strong functional moves, color (borrowed chords, secondary dominants, deceptive moves), and surprises (tritone subs, chromatic mediants, one-note neo-Riemannian moves). Each card draws the smoothest voice leading from the notes you're holding on a mini keyboard: arrows for moving voices, dots for held common tones, ghosts for notes you leave. Red dots show the keys you're holding right now, so you can match a card by ear and eye. Click a card to hear it. A chord you play is only a candidate (dashed, with a "?") until you commit it, so you can try several next chords against the same board. Commit with the sustain pedal (when the Pedal switch says "commit"; flip it to "sustain" to get the pedal back), Enter, the Commit button, or a Launchkey button mapped with the learn button under Commit. Undo and Clear can be mapped the same way, and Backspace or the × on the last chip removes it too. The strip labels the moves you followed and spots known progressions (ii–V–I, I–V–vi–IV, the Andalusian cadence…). Play loops the committed chords at the tempo and beats per chord you set. The progression is saved, so a reload picks up where you left off. Without a key, suggestions fall back to moves relative to the current chord.
- Patches: **Save** writes to the selected patch (on **Init** it asks for a name), **Save as…** makes a new one, and choosing **Init** resets to the defaults. "edited" means there are unsaved changes.
- Everything is saved in localStorage: the current settings, the named patches, the MIDI mappings, and the octave and velocity. Patches and mappings are separate, so loading a patch keeps your knob mappings.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
