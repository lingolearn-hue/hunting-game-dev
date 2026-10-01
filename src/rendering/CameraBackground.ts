/** Live camera image used as the AR background. */
export class CameraBackground {
  readonly video = document.createElement('video');
  ok = false;
  /** Assumed field of view (deg) along the long side of the camera image. Adjustable (calibration). */
  fovLong = 65;
  onChange?: () => void;

  constructor() {
    const v = this.video;
    v.playsInline = true; v.muted = true; v.autoplay = true;
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;transform-origin:50% 50%';
    v.addEventListener('loadedmetadata', () => this.onChange?.());
  }

  /** Must be called directly from a user gesture (permission prompt). Resolves false if unavailable or denied. */
  start(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve(false);
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (stream) => {
        this.video.srcObject = stream;
        await this.video.play();
        this.ok = true;
        this.onChange?.();
        return true;
      })
      .catch(() => false);
  }

  attach(container: HTMLElement): void { container.prepend(this.video); }

  /** Digital zoom: magnify the image around the center, like the virtual camera does. */
  setZoom(z: number): void { this.video.style.transform = z === 1 ? '' : `scale(${z})`; }

  /** Vertical FOV (deg) of the part of the image visible on a screen of sw x sh (object-fit: cover). */
  vfovDeg(sw: number, sh: number): number {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    let tanHalfV: number;
    if (this.ok && vw > 0 && vh > 0) {
      const perPx = Math.tan((this.fovLong * Math.PI) / 360) / (Math.max(vw, vh) / 2); // tan(angle) per image pixel
      const scale = Math.max(sw / vw, sh / vh);
      tanHalfV = (perPx * (sh / scale)) / 2;
    } else {
      // No image: assume the long side of the screen shows fovLong
      tanHalfV = Math.tan((this.fovLong * Math.PI) / 360) * (sh / Math.max(sw, sh));
    }
    return (2 * Math.atan(tanHalfV) * 180) / Math.PI;
  }

  /** Draws the (zoomed, cover-fit) camera image onto a 2D canvas, for photos. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number): void {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!this.ok || !vw || !vh) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h); return; }
    const scale = Math.max(w / vw, h / vh) * zoom;
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(this.video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}
