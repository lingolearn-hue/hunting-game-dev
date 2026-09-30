Version: 7 — 2026-09-30

# Hunting Game

Phone-as-viewport hunting / wildlife simulation. Spec: `spec/Spec_v05.md`.

Status: photography + hunting: walking/crouching, dual-stick touch controls, Forest and Dinosaur Valley, equipment (binoculars, camera, rifle) with zoom and aim sway, hit model, harvest log, photo gallery, PWA/offline.

Debug overlay: append `?debug` to the URL (nearest animal, state, awareness).

## Dev

    npm install
    npm run dev      # HTTPS (self-signed), open the LAN URL on the phone
    npm run build    # output in docs/ (GitHub Pages)

## Controls

- Phone: rotate to look, left stick walks, right stick looks, red button takes a photo / fires, CROUCH for stealth, +/- or pinch to zoom, BINOCULARS/CAMERA/RIFLE to switch equipment, MENU for calibrate, photos/harvest, fullscreen and level select.
- Desktop: drag to look, WASD to walk, C to crouch, wheel or +/- to zoom, 1/2/3 to switch equipment, click or Space to use, R to recalibrate.

## Install / offline

Open the Pages URL once online, then use "Add to Home Screen" (iOS: Share > Add to Home Screen; Android: Install app). After the first load the game works offline. HTTPS is required.
