import { StudioProject } from '../types/studio';

const DB_NAME = 'kinetik_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'autosave';
const CURRENT_KEY = 'current_project';

export interface AutosaveSnapshot {
  project: StudioProject;
  audioBlob?: Blob | null;
  audioName?: string | null;
  savedAt: number;
}

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveAutosaveSnapshot(snapshot: AutosaveSnapshot): Promise<void> {
  try {
    const db = await openStudioDb();
    // Avoid storing overly large audio blobs (>60 MB) inside IndexedDB
    const safeAudioBlob =
      snapshot.audioBlob && snapshot.audioBlob.size <= 60 * 1024 * 1024
        ? snapshot.audioBlob
        : null;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(
        {
          project: snapshot.project,
          audioBlob: safeAudioBlob,
          audioName: safeAudioBlob ? snapshot.audioName ?? null : null,
          savedAt: snapshot.savedAt,
        },
        CURRENT_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback quietly if private browsing disables IndexedDB
  }
}

export async function loadAutosaveSnapshot(): Promise<AutosaveSnapshot | null> {
  try {
    const db = await openStudioDb();
    const res = await new Promise<AutosaveSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CURRENT_KEY);
      req.onsuccess = () => resolve((req.result as AutosaveSnapshot) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!res || !res.project || !Array.isArray(res.project.cues)) {
      return null;
    }
    return res;
  } catch {
    return null;
  }
}

export async function clearAutosaveSnapshot(): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CURRENT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export interface SerializedKinetikProject {
  format: 'kinetik-studio-project';
  version: number;
  exportedAt: string;
  project: StudioProject;
}

export function exportProjectJsonBlob(project: StudioProject): { blob: Blob; filename: string } {
  const payload: SerializedKinetikProject = {
    format: 'kinetik-studio-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
  };
  const safeName =
    (project.name || 'kinetik-project')
      .trim()
      .replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'kinetik-project';

  return {
    blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    filename: `${safeName}.kinetik.json`,
  };
}

export function parseProjectJsonText(rawText: string): StudioProject {
  const parsed = JSON.parse(rawText);
  const candidate: StudioProject =
    parsed && parsed.format === 'kinetik-studio-project' && parsed.project
      ? parsed.project
      : parsed;

  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !Array.isArray(candidate.cues) ||
    !candidate.typography ||
    !candidate.motion ||
    !candidate.background
  ) {
    throw new Error('File dự án .kinetik.json không đúng định dạng hợp lệ.');
  }
  return candidate;
}
