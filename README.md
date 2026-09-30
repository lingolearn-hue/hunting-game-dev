Version: 5 — 2026-09-30

# Hunting Game

Phone-as-viewport hunting / wildlife simulation. Spec: `spec/Spec_v03.md`.

Status: Phase 3 + movement + levels: walking/crouching, Forest (deer) and Dinosaur Valley (Parasaurolophus, Triceratops, Raptor, T-rex), tap-to-photograph, scoring, IndexedDB photos, gallery.

Debug overlay: append `?debug` to the URL (nearest animal, state, awareness).

## Dev

    npm install
    npm run dev      # HTTPS (self-signed), open the LAN URL on the phone
    npm run build    # output in docs/ (GitHub Pages)

## Controls

- Phone: rotate to look, left stick to walk, CROUCH for stealth, pinch to zoom, tap to photograph, CALIBRATE to reset heading, GALLERY to view photos, LEVEL to return to level select.
- Desktop: drag to look, WASD to walk, C to crouch, wheel to zoom, click or Space to photograph, R to recalibrate.
