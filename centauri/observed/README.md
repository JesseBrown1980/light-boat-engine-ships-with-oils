# Asolaria Observation Tape — 2D ⇄ x-y-time ⇄ 2D

This mode corrects the earlier proposal to enumerate simulated particles: **measured photos are the source of truth**, and playback reprojects relationships extracted from them.

## Run

Visit /centauri/observed/ in GitHub Pages, load exactly three independently acquired FITS exposures of the **same sky field**, in chronological order, and click **START · PLAY UNTIL STOP**. The player continuously replays the three measured frames (forward and reverse) until **STOP** is clicked. No timer ends the run.

The main callback composites predecoded source imagery on a canvas and projects at most 243 matched bright leaf addresses. Source FITS ingestion, quantization, raw-file SHA-256, QR encoding and receipts all happen in a separate Web Worker. The 600-second checkpoint is a *snapshot cadence*, not a stopping condition; a worker-busy capture is skipped rather than obstructing a display frame.

## Representation

- Source inputs are **raw binary FITS observation files**. Supported first 2D image plane: FITS BITPIX 8, 16, 32, 64, -32 and -64, BSCALE/BZERO; 2D primary and IMAGE-extension HDUs. The first plane of a FITS cube is supported; no physical interpretation of other axes is implied.
- Nine intensity bands quantize each observed image separately. The rainbow gradient is a display codebook for measured **intensity**. It does not turn a single-filter FITS exposure into nine spectral wavelength measurements. Original FILTER/DATE-OBS/TELESCOP/OBJECT and raw SHA-256 are preserved.
- Bright local image features become sparse **leaf addresses**. A simple bounded nearest-neighbor correspondence algorithm links candidate features between frames. It is uncalibrated and can mismatch; failed or zero matches are never promoted as physical detections.
- Three source 2D observations are stacked into an address space **(x, y, observation epoch)**. Reprojecting that 3D data space to novel virtual 2D screen angles is an *x-y-time* visualization. It is **not a solved physical distance/parallax/depth**.
- Between observations the display interpolates and fades between **real input frames**. Reverse replay is a playback convention, not time reversal in nature. It does not predict unobserved Centauri epochs.
- The freeze/QR snapshot stores content-addressed **quantized sparse projection receipts**, 27 selected leaf tracks per projection, and original FITS SHA256s. QR transport roundtrip is byte-exact for that **receipt**. Raw FITS image pixels are **not** recovered from the compact QR receipt; preserve original files separately.

## Test and evidence

Node 22:

    node --test centauri/observed/observation.test.mjs

Hosted CI checks Linux/Windows software tests and independently downloads a **real HST raw FITS sample from the NASA Science Data Portal** for ingestion and provenance hashing. That example is a real astronomical image but is **not** three temporal Centauri exposures. Synthetic binary FITS tests check what happens when measured-looking features shift, without claiming that as an astronomical observation.

NASA FITS sample (raw data verification only): https://science.data.nasa.gov/sites/default/files/2026-06/hst-wfpc-II-800-800-4.fits

For the intended real-world experiment the next required inputs are three **independent time-stamped and registered Centauri FITS observations**, ideally with WCS and calibration/PSF information; the current nearest-bright-leaf alignment is deliberately provisional. No evidence of unique 3D stellar depth, gravitational forces, quark dynamics or quantum-diode computation can be extracted from three arbitrary 2D files.

This is a reproducible real-data software workflow, not a claim of completed Centauri astrometric validation.
