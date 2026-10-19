# smallpancakes’s guitar practice room

The companion tools for smallpancakes’s guitar practice diary, so anyone can follow along without an account.

A small, dependency-free guitar practice toolbox with a one-minute chord-change timer, a metronome and fretboard practice with note-name or staff answers. Choose a chord pair, enable the microphone, wait for the quiet-level check, then strum to start a 60-second round. Strum once per chord; each detected strum counts as one, including the first. Review the estimate before saving.

Use **Palette** in the header to choose **Pancake**, the default cream, honey, peach and warm brown colors from [smallpancakes’s personal blog](http://smallpancakes.nekoweb.org/), or **Original pastel**, the earlier purple, mint, pink and yellow colors. The choice is shared across the tools, remembered in this browser and synchronized between open tabs. If storage is blocked, the chosen colors still apply on the current page. `tests-palette.html` checks the palette switcher.

## Language

Use **Language / 語言** in the header to choose **English** or **繁體中文** (Traditional Chinese). The choice is remembered across tools and visits. On the first visit, Traditional Chinese browser preferences (`zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO`) select Traditional Chinese; other languages fall back to English. Links with `?lang=zh-Hant` or `?lang=en` override the saved choice and work when storage is blocked.

Switch languages between rounds; the selector is disabled during practice and while a chord result awaits saving or discarding. Switching reloads the page. Saved practice records, level identifiers, chord symbols and note names are shared between languages. Practice-log dates follow the selected language.

Translations live in `translations-zh-Hant.js`, keyed by English source text. `i18n.js` translates authored markup once; runtime messages use `t('message')` or tagged templates with reorderable numbered placeholders. Add new user-facing messages to the catalog and wrap dynamic messages with `t`. `tests-i18n.html` covers language detection, persistence, blocked storage, all tools, quiz feedback, keyboard behavior and narrow layouts.

## USB guitar input (including Mustang Micro Plus)

Connect the powered-on interface with a USB data cable. In the chord-change tool, open **Audio settings** and use **Check input** and grant the browser’s microphone permission (this also covers USB audio). Select the Mustang Micro Plus, or the USB audio name shown by your operating system, from **Audio input**. **Refresh devices** rescans the list without opening a microphone.

Strum while checking: the input meter should move while the timer remains at 1:00. For a faint signal, raise **Input boost** from Off to +20 dB, then increase gradually (up to +40 dB) if needed. This scales the signal used by both calibration and detection, and the displayed meter; it does not alter headphone volume. Boost raises noise too. Reduce it if the level warns that boost is too high. Set it before starting a round; changing devices resets it to Off. Use a clean preset without delay/reverb and pause backing tracks. Listen through headphones on the interface; the tool does not monitor the guitar through the computer. Then click **Start listening**, stay quiet for calibration, and strum to begin.

A selected device is requested explicitly. If unavailable, the app reports the problem instead of falling back to a laptop microphone. Switching devices during a check closes the previous stream. Input selection is locked during an active exercise; cancel first to change it. The input choice lasts for this page visit. The detector still estimates strums, not chord quality.

[Fender confirms the Mustang Micro Plus can act as a USB recording input](https://www.fender.com/articles/parts-and-accessories/how-to-use-fender-studio-with-compatible-interfaces). The input controls and lifecycle have browser tests; the physical device needs checking on your computer.

## Metronome

Open `metronome.html` or choose **Metronome** in the tool navigation. Set 40–240 BPM with the number field, slider, plus/minus buttons or Tap tempo. Choose 1–6 beats per bar, optionally accent beat one, and adjust the volume (0 mutes sound but keeps the beat indicators). Each click is one beat; subdivisions and compound-meter grouping are not included.

Press Start or use Space when focus is outside a form control. Clicks use Web Audio’s clock with a short look-ahead scheduler, following [MDN’s audio scheduling approach](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques). Tempo changes take effect within the short scheduling window; changing beats per bar restarts the bar. Leaving or hiding the page stops playback. No microphone permission is needed.

Tempo, beats, accent and volume are remembered on this browser. If storage is blocked, controls still work for the current visit. Metronome and chord-change practice use separate pages, so switching tools releases their audio resources.

## Fretboard

The diagram includes a position-marker strip matching the Player II Telecaster through fret 12: single dots at 3, 5, 7 and 9, double dots at 12. Markers stay visible during quizzes and only appear for frets in the selected area.

Open `fretboard.html` or choose **Fretboard** in the tool navigation. Start by exploring C, D and E on the B string: frets 1, 3 and 5. Tap a labeled note to hear a synthesized reference tone, then find it on your guitar.

With **Answer with → Note names · C D E**, choose **Try 6 questions** for alternating note-location and note-name questions. Show answer counts as practice with help; an incorrect answer shows the correct location. In **My guitar · self-check**, play the requested note before revealing its location, then choose I knew it or Still learning. This mode uses your judgment, not microphone recognition. Quiz answers are hidden from the reference guide until the round ends.

Questions prioritize locations with fewer earned recalls; within that group, locations are covered before repeating and previous misses have higher selection weight. Recall counts are saved locally, separately from the other tools. The level selector offers 24 levels in four tiers: First notes, Connect strings, Learn the neck, and Sharps & flats. Each level tracks two successful recalls per location; completing a round after reaching that goal earns a permanent completion mark. Hints and wrong answers do not add progress, while guitar self-checks do. Questions prioritize locations with fewer earned recalls. You can revisit or jump ahead freely; the selected level and completion marks survive reloads. Earlier recall totals are preserved separately and do not imply level completion. Standard tuning only. Sharp/flat equivalents share an answer, and open-string and twelfth-fret prompts specify which location to use so both locations receive practice.

Each round ends with recall results and actions to repeat, explore, or advance after completing the current level. The sidebar directly shows the 24 levels in four independently expandable tiers, with separate level names and recall counts. The current tier opens automatically and the list scrolls to the selected level; all levels remain selectable outside a round. Melody building is no longer part of this tool. Tap notes in explore/results to hear a synthesized reference tone; audio stops when the page is hidden or left. No microphone or account is needed; when storage is blocked, practice still works for the current visit.

`tests-fretboard.html` checks pitch mapping, practice scopes, adaptive selection, storage validation, quiz and self-check scoring, result actions, tier navigation, selected-row hover, persistence and mobile overflow.

### Answer on the staff

Choose **Answer with → Place a note on the staff** to turn a shown guitar string/fret position into written guitar notation. This is for connecting a familiar fretboard or tab position to the staff. Click or tap a line or space, or use Up/Down arrows, choose Natural, Sharp or Flat, and press Enter or **Check staff answer**. Feedback above the staff says **Correct!**, **Not quite** or **Answer revealed**. After a wrong answer, your hollow note stays on the left beside the filled correct note on the right, each labeled. Correct answers retain your accepted sharp/flat spelling. Grading hides the accidental and check controls and brings the staff feedback into view; Enter continues. Show answer reveals the correct note without earning a recall. The answer must match the exact sounding pitch, including octave; equivalent sharp/flat spellings are accepted. Guitar notation is written one octave above its sounding pitch: B-string fret 1 is written C5 and sounds C4.

Staff answers use the same 24 levels and six-question rounds as note-name answers, with separate recall totals, level completion and selected level. Guitar self-check shares the note-name progress. Switch answer modes outside a round. Notation uses a local Bravura font; if it fails to load, note-name practice remains available. `tests-staff-answer.html` checks staff placement and the fretboard integration.

### Keyboard practice

In note-name mode, start a round with Tab and Enter. The answer field receives focus automatically: type a fret number (0–12 within the selected area) or a note name such as C, C# or Db, then press Enter. Fret answers apply to the string named in the question. Invalid input asks for correction without counting an attempt. After feedback, Enter continues; after results, Enter repeats the round. Tab reaches hints, next-level controls and other options.

The fretboard and note-choice buttons each occupy one Tab stop. Arrow keys move across frets/between strings or through note choices, and Enter/Space activates the focused button. Home/End go to the first/last available fret on a string or note option. Selects and tier summaries retain normal keyboard behavior. In guitar self-check mode, Enter reveals the answer; Tab chooses I knew it or Still learning and Enter confirms. Holding Enter does not submit repeated answers.

## Optional standalone staff reading

The earlier `staff.html` page remains accessible directly; it is not in the main tool navigation. It is separate from the fretboard staff-answer mode above. Explore a written note, then complete six-question rounds by typing its name and pressing Enter. Enter after feedback continues. Twelve levels cover familiar C/D/E, treble lines and spaces, ledger lines, open strings, sharps, flats and a mixed written E3–A5 range. Levels are freely selectable; two correct recalls per written note complete a level at the end of a round. Staff progress and selected level are saved separately from fretboard progress.

Answers name the written spelling: C# and Db sound alike, but are different answers on the staff. Use `#`/`b` or the musical symbols; an optional octave number refers to the written pitch. No octave number is required. Invalid input is not scored; revealing an answer earns no progress. Fingerings and audio are hidden until the question is answered. The reference guide and note selector stay hidden throughout the round.

Guitar treble notation sounds one octave below the written pitch; the clef carries a small 8 below it. Written C5 maps to sounding C4, including B-string fret 1. After grading, the guide lists up to three matching positions through fret 12; Hear this note plays the sounding pitch with a synthesized tone. This is pitch reading, not rhythm or key-signature practice. Notation uses local Bravura glyphs with deterministic SVG staff/ledger geometry. If the font cannot load, the quiz remains disabled with a reload message.

References: [Open Music Theory: reading clefs](https://viva.pressbooks.pub/openmusictheory/chapter/clefs/), [staff and ledger lines](https://www.musictheory.net/lessons/10). The self-hosted [Bravura font](https://github.com/steinbergmedia/bravura) is by Steinberg; its SIL Open Font License is in `assets/bravura-LICENSE.txt`.

`tests-staff.html` verifies pitch geometry, ledger lines, guitar octave mapping, written spelling, progress, keyboard focus, answer concealment, responsive layout, persistence and isolation from fretboard progress.

## GitHub Pages

Deployment target: https://smallpancakes.github.io/guitar-practice-room/

GitHub Pages publishes the committed `docs/` folder on `main`. In repository **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/docs**.

After changing the app:

```sh
python3 scripts/check-browser.py
python3 scripts/build-pages.py
git add .
git commit -m "Update practice room"
git push
```

The packaging script copies only browser files and self-hosted fonts into `docs/`; tests, tooling, and repository documentation stay outside the website. Commit both source changes and the refreshed `docs/` files. All asset paths are relative, so the app works under `/guitar-practice-room/`.

See [GitHub’s branch publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Run

From this folder:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in a current Chrome, Firefox, Edge or Safari browser. For another device, deploy the static files over HTTPS; a plain HTTP LAN address cannot request microphone access. No build step is required.

## Behaviour

- Audio is processed locally with Web Audio and is never recorded or sent to a server.
- The detector combines volume attacks with new energy across frequency bands, using a calibrated noise floor and a shared 230 ms cooldown. The volume path re-arms after 64 ms of settling; a spectral attack can count even when a loud open string prevents that settling or masks the volume increase. A 2048-sample analysis window reduces low-string fluctuations, and volume smoothing uses elapsed time rather than frame count. Input boost applies equally to both paths and their calibration. It estimates strums, not chord identities or correctness. Speech, taps and other sounds can count; ringing, soft or very fast strums can be missed. Adjust sensitivity and correct the final result.
- Manual mode starts on your first tap or Space press and counts each subsequent tap.
- Switching tabs or hiding the page cancels the round to avoid silently missing changes.
- The mic stops when the round finishes, is cancelled, or the page closes. Microphone mode plays a short end tone when audio is available.
- History and personal bests are grouped by chord pair (A/D and D/A are the same pair). Data is stored only in this browser. Clearing site data deletes it. Download the log for a backup; import is not yet implemented.
- The log shows the eight most recent rounds for the selected pair; the downloaded log includes all pairs and rounds.

## Checks

Run `python3 scripts/check-browser.py` with Chrome or Chromium installed to run all checks in an isolated browser profile. Alternatively, serve the project and open `/tests.html` to run deterministic checks for attack detection, the timer boundary, and record validation. Open `/tests-input.html` for USB selection, preview, +8 dB spectral counting and disconnect handling. Open `/tests-audio.html` for generated ringing-string PCM processed through the browser’s real FFT at different sample rates and frame intervals. Open `/tests-metronome.html` for timing, audio rendering, lifecycle and metronome interaction checks. Open `/tests-ui.html` in a separate test browser profile for integration checks of manual and microphone flows, saving, errors, cancellation and responsive overflow. The integration harness temporarily replaces browser storage and restores it after completion. These synthetic tests do not substitute for testing with a real guitar and microphone.

## Tailnet access

An optional Tailscale Serve deployment can make the app available privately at your device’s HTTPS hostname under `/guitar/`. Use the full HTTPS hostname so microphone access works. Progress is saved separately in each browser and origin; localhost, tailnet, and GitHub Pages history do not automatically transfer between sites.

Tailscale Serve hosts the browser files and self-hosted fonts in `.tailnet-public`, independently of the temporary Python preview server. The existing app at `/` is preserved.

After changing the app, refresh the served assets:

```sh
python3 scripts/prepare-tailnet.py
```

Configure the route with:

```sh
sudo tailscale serve --bg --set-path=/guitar "$PWD/.tailnet-public"
```

To remove only this app’s route:

```sh
sudo tailscale serve --https=443 --set-path=/guitar off
```

The chord-change page includes 25 common pairs in the Common changes selector. Pick for me selects a random pair other than the current one. Custom chord selection remains available; pair choices are locked during a session and count review.
