# Asolaria Centauri Freeze → Play — uninterrupted synthetic experiment

Open the GitHub Pages experiment at https://jessebrown1980.github.io/light-boat-engine-ships-with-oils/centauri/ after merge. Click START — RUN UNTIL STOP. The field evolves as a function of monotonic elapsed time. There is no automatic stop timer. Click STOP to end animation and the QR worker. FREEZE FRAME NOW takes an additional snapshot without pausing the field.

## Scope / tested model

- Three 2D virtual-camera views (0°, 120°, 240° yaw) of one tiny synthetic test scene with three named Centauri source labels. The law is explicitly an analytic toy orbit, not telescope observation, true gravity, or quarks.
- Nine separately preserved wavelength-bin samples spanning 380–740 nm for each source. An illustrative gradient is displayed via ordinary RGB pixels; all nine numerical bins are carried in each frame.
- Snapshot at START and every 600 seconds of elapsed time, without terminating execution. The browser does not numerically enumerate points or backfill missed time.
- A Web Worker encodes deterministic frozen frames, SHA-256, 4-byte little-endian indexed chunks, base64 and ISO QR codes in three separate R/G/B planes. Compatible with the chunk/plane format specified at https://jessebrown1980.github.io/the-colour-qr/.
- Each QR image can be saved as full-resolution PNG. EXPORT downloads a JSON bundle with verified manifest, all camera projections and raw indexed packet payloads for independent readback.
- Only the most recent encoded image set is retained in browser memory; no automatic durable history is claimed.

## Limitations and safety

- Display pixels produce visible light, not autonomous processing of virtual particles. No quantum-diode computer or physical optical sensor is controlled through this browser.
- QR and SHA never block the JavaScript display loop. Browsers can still suspend hidden tabs, throttle workers or close. State on return evaluates current monotonic time rather than iterating a backlog. Truly uninterrupted 24/7 execution needs a supervised native process and durable storage.
- Three virtual projections of a synthetic scene do not establish unique reconstruction of an unknown physical 3D scene. Real Centauri work needs calibrated observing data, uncertainty intervals and held-out validation.
- The QR encoder vendor file is Project Nayuki's MIT code with Cyphr.me additions. Its license is preserved at vendor/qrgen-LICENSE.md.

## Reproducible tests

Node 22+, no npm dependencies:

    node --test centauri/core.test.mjs

CI runs on Linux and Windows. Browser workers require a web server (GitHub Pages), not a file:// URL.

## Next integration

Add actual time-stamped Centauri measurements, units and uncertainties, and compare predicted changes with held-out observed frames. Independently decode the saved QR PNGs. Do not conflate synthetic geometric closure with physical gravitational or optical proof.
