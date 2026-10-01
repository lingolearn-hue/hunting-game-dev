import { SyntheticRenderer } from './SyntheticRenderer';
import { CameraBackground } from './CameraBackground';
import { Game } from '../game/Game';
import { setBaseFov } from '../game/view';

/**
 * AR renderer: the camera image is the background, a transparent WebGL canvas draws the virtual objects
 * (drones, rockets, explosions) on top. The view orientation comes from the phone sensors.
 */
export class ARRenderer extends SyntheticRenderer {
  constructor(private bg: CameraBackground) {
    super();
    this.arMode = true;
    bg.onChange = () => this.applyFov();
  }

  override init(container: HTMLElement, game: Game): void {
    this.bg.attach(container);
    super.init(container, game);
    this.applyFov();
  }

  override resize(): void {
    super.resize();
    this.applyFov();
  }

  override render(game: Game): void {
    this.bg.setZoom(game.player.zoom);
    super.render(game);
  }

  /** Photo = camera image + virtual objects. */
  override async capture(game: Game): Promise<Blob | null> {
    this.render(game);
    const w = this.gl.domElement.width, h = this.gl.domElement.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    this.bg.draw(ctx, w, h, game.player.zoom);
    ctx.drawImage(this.gl.domElement, 0, 0); // right after rendering, while the buffer is valid
    return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.85));
  }

  /** Match the virtual camera's field of view to the displayed camera image. */
  applyFov(): void {
    if (!this.container) return;
    setBaseFov(this.bg.vfovDeg(this.container.clientWidth, this.container.clientHeight));
  }
}
