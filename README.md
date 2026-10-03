Version: 15 — 2026-10-03

# Hunting Game

Phone-as-viewport hunting / wildlife simulation. Spec: `spec/Spec_v13.md`.

Status: photography + hunting + naturalist mode, tech tree with coins per level (zoom steps, thermal view, torch, multitool, building), night monsters, respawn, sky with sun/moon/stars/clouds, minimap: 5 levels (Forest, Dinosaur Valley, Machine Range with seeker rockets, AR Camera Test, AR World with WebXR SLAM tracking on Android), 480 m area, predator attacks with respawn, wind and scent, tracking, day/night, positional audio, field journal, dual-stick controls, PWA/offline.

3D Scan (beta, start screen): rudimentary sparse 3D mapping from optical flow plus the phone orientation, in plain JS, works in iPhone Safari (see spec section 50). Synthetic test: `npx tsx tests/slam-synthetic.ts`.

Debug overlay: append `?debug` to the URL (nearest animal, state, awareness).

## Dev

    npm install
    npm run dev      # HTTPS (self-signed), open the LAN URL on the phone
    npm run build    # output in docs/ (GitHub Pages)

## Controls

- Phone: rotate to look, left stick walks, right stick looks, red button takes a photo / fires, CROUCH for stealth, +/- or pinch to step through the zoom levels, CAM/BINO/RIFLE/ROCKET/TORCH/TOOL to switch tools (new tools are bought in MENU > TECH TREE), MENU for calibrate, photos/harvest, journal, fullscreen and level select. Start screen: RESET and UNLOCK ALL per level.
- Desktop: drag to look, WASD to walk, C to crouch, wheel or +/- to zoom, 1-6 to switch tools, T = thermal view, click or Space to use, R to recalibrate.

## Install / offline

Open the Pages URL once online, then use "Add to Home Screen" (iOS: Share > Add to Home Screen; Android: Install app). After the first load the game works offline. HTTPS is required.

## To do

- Road detection (segmentation model) for ground vehicles on real roads. The AR World level already provides metric tracking and the ground plane (`spec/Spec_v10.md`, sections 37 and 38).
- Test the AR World level on an Android phone (WebXR cannot be tested without a device).
