/** Simple full-screen menu with a list of actions. */
export class Menu {
  private root = document.createElement('div');

  constructor(items: Array<[string, () => void]>) {
    this.root.id = 'menu';
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { this.close(); fn(); };
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
