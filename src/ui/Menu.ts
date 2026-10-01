export interface MenuItem {
  label: string;
  /** Called on click. May update the button label. */
  fn: (btn: HTMLButtonElement) => void;
  /** Keep the menu open after the click (toggles). */
  keepOpen?: boolean;
}

/** Simple full-screen menu with a list of actions. */
export class Menu {
  private root = document.createElement('div');

  constructor(items: MenuItem[]) {
    this.root.id = 'menu';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.onclick = () => { if (!it.keepOpen) this.close(); it.fn(b); };
      this.root.append(b);
    }
    const c = document.createElement('button');
    c.textContent = 'CLOSE';
    c.onclick = () => this.close();
    this.root.append(c);
    document.body.append(this.root);
  }

  open(): void { this.root.style.display = 'flex'; }
  close(): void { this.root.style.display = 'none'; }
}
