import { ScoreBreakdown } from '../game/Scoring';

export interface PhotoRecord {
  id?: number;
  schema: number;
  timestamp: number;
  position: { x: number; y: number; z: number };
  level?: string;
  species: string | null;
  animalId: number | null;
  distance: number;
  equipment: string;
  zoom: number;
  weather: string;
  timeOfDay: number;
  score: number;
  breakdown: ScoreBreakdown | null;
}

/** Field journal entry, one per discovered species. */
export interface JournalEntry {
  species: string;
  firstSeen: number;
  level: string;
  watchSeconds: number;
  behaviors: string[];   // observed states, lower case
  photos: number;
  bestScore: number;
  kills: number;
}

export interface HuntRecord {
  id?: number;
  schema: number;
  timestamp: number;
  level: string;
  species: string;
  zone: string;
  distance: number;
  damage: number;
  killed: boolean;
}

const DB_NAME = 'hunting-game';
const DB_VERSION = 3; // v2: added 'hunts'. v3: added 'journal'. Add migrations in onupgradeneeded when bumping.
export const RECORD_SCHEMA = 1;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

/** Metadata ('photos') and image blobs ('blobs') are stored separately. */
export class PhotoStore {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((res, rej) => {
        const o = indexedDB.open(DB_NAME, DB_VERSION);
        o.onupgradeneeded = () => {
          const db = o.result;
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
          if (!db.objectStoreNames.contains('hunts')) db.createObjectStore('hunts', { keyPath: 'id', autoIncrement: true });
          if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', { keyPath: 'species' });
        };
        o.onsuccess = () => res(o.result);
        o.onerror = () => rej(o.error);
      });
      this.dbp.catch(() => { this.dbp = null; });
    }
    return this.dbp;
  }

  async add(rec: PhotoRecord, blob: Blob): Promise<number> {
    const db = await this.db();
    const tx = db.transaction(['photos', 'blobs'], 'readwrite');
    const id = (await req(tx.objectStore('photos').add(rec))) as number;
    tx.objectStore('blobs').put(blob, id);
    await done(tx);
    return id;
  }

  async list(): Promise<PhotoRecord[]> {
    const db = await this.db();
    const all = await req(db.transaction('photos').objectStore('photos').getAll()) as PhotoRecord[];
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getBlob(id: number): Promise<Blob | undefined> {
    const db = await this.db();
    return req(db.transaction('blobs').objectStore('blobs').get(id));
  }

  async remove(id: number): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['photos', 'blobs'], 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.objectStore('blobs').delete(id);
    await done(tx);
  }

  async addHunt(rec: HuntRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('hunts', 'readwrite');
    tx.objectStore('hunts').add(rec);
    await done(tx);
  }

  async listHunts(): Promise<HuntRecord[]> {
    const db = await this.db();
    const all = await req(db.transaction('hunts').objectStore('hunts').getAll()) as HuntRecord[];
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  async listJournal(): Promise<JournalEntry[]> {
    const db = await this.db();
    return req(db.transaction('journal').objectStore('journal').getAll()) as Promise<JournalEntry[]>;
  }

  async putJournal(entry: JournalEntry): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('journal', 'readwrite');
    tx.objectStore('journal').put(entry);
    await done(tx);
  }
}
