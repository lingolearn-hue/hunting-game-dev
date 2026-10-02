import { SyntheticRenderer } from './SyntheticRenderer';
import { Game } from '../game/Game';
import { setBaseFov } from '../game/view';

/* WebXR types are not part of the DOM lib; the session and frames are used through `any`. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface XRPose {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

/**
 * WebXR AR renderer: the browser composites the camera image and provides 6-DoF tracking (ARCore).
 * Only virtual objects are drawn. The frame loop belongs to the XR session.
 */
export class XRRenderer extends SyntheticRenderer {
  private frame: any = null;
  private hitSource: any = null;

  constructor(private session: any) {
    super();
    this.arMode = true;
  }

  override init(container: HTMLElement, game: Game): void {
    super.init(container, game);
    this.gl.xr.enabled = true;
    this.gl.xr.setReferenceSpaceType('local-floor');
    void this.gl.xr.setSession(this.session);
    // Hit-testing from the screen center finds the real ground (optional feature).
    this.session.requestReferenceSpace('viewer')
      .then((space: any) => this.session.requestHitTestSource({ space }))
      .then((src: any) => { this.hitSource = src; })
      .catch(() => { /* hit-test not available */ });
    this.session.addEventListener('end', () => location.reload());
  }

  override resize(): void {
    if (this.gl.xr.isPresenting) return; // the XR session controls the size
    super.resize();
  }

  runLoop(cb: (now: number) => void): boolean {
    this.gl.setAnimationLoop((t: number, frame: any) => { this.frame = frame ?? null; cb(t); });
    return true;
  }

  /** Tracked head pose of the current XR frame (also updates the field of view from the real camera). */
  viewerPose(): XRPose | null {
    if (!this.frame) return null;
    const ref = this.gl.xr.getReferenceSpace();
    if (!ref) return null;
    const pose = this.frame.getViewerPose(ref);
    if (!pose) return null;
    const m = pose.views?.[0]?.projectionMatrix;
    if (m && m[5] > 0) setBaseFov((2 * Math.atan(1 / m[5]) * 180) / Math.PI); // exact vertical FOV of the camera
    const t = pose.transform;
    return { position: t.position, orientation: t.orientation };
  }

  /** Height (y, tracked space) of the real surface at the screen center, or null. */
  groundHit(): number | null {
    if (!this.frame || !this.hitSource) return null;
    const results = this.frame.getHitTestResults(this.hitSource);
    const ref = this.gl.xr.getReferenceSpace();
    if (!results.length || !ref) return null;
    const pose = results[0].getPose(ref);
    return pose ? pose.transform.position.y : null;
  }
}
