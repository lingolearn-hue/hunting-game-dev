Version: 2 — 2026-09-30

# Hunting Game

Phone-as-viewport hunting / wildlife simulation. Spec: `spec/Spec_v02.md`.

Status: Phase 1 (sensor prototype): Three.js forest, DeviceOrientation camera, desktop mouse fallback, no animals.

## Dev

    npm install
    npm run dev      # HTTPS (self-signed), open the LAN URL on the phone
    npm run build    # output in docs/ (GitHub Pages)

## Controls

- Phone: rotate to look, pinch to zoom, CALIBRATE to reset heading.
- Desktop: drag to look, wheel to zoom, R to recalibrate.
