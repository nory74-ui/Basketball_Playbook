import { PlayCategory, PlayData } from '../types';

const STORAGE_KEY = 'bv_plays_v3';

export const PLAY_CATEGORIES: { id: PlayCategory; label: string }[] = [
  { id: 'offense', label: 'セットオフェンス' },
  { id: 'defense', label: 'ディフェンス' },
  { id: 'inbounds', label: 'インバウンズ' },
  { id: 'zone', label: 'ゾーン攻略' },
  { id: 'transition', label: '速攻・トランジション' },
  { id: 'other', label: 'その他' },
];

const VALID_CATEGORIES = new Set<PlayCategory>(PLAY_CATEGORIES.map((c) => c.id));

export function normalizeCategory(cat: unknown): PlayCategory {
  if (typeof cat === 'string' && VALID_CATEGORIES.has(cat as PlayCategory)) {
    return cat as PlayCategory;
  }
  return 'offense';
}

export function getCategoryLabel(cat?: PlayCategory): string {
  const normalized = normalizeCategory(cat);
  return PLAY_CATEGORIES.find((c) => c.id === normalized)?.label ?? 'その他';
}

function isValidPlayData(item: unknown): item is PlayData {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<PlayData>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.frames) &&
    candidate.frames.length > 0
  );
}

function sanitizePlayData(item: PlayData): PlayData {
  return {
    id: String(item.id),
    name: String(item.name).trim() || '名称未設定プレイ',
    date: typeof item.date === 'string' ? item.date : new Date().toLocaleString('ja-JP'),
    courtType: item.courtType === 'full' ? 'full' : 'half',
    category: normalizeCategory(item.category),
    frames: item.frames.map((f) => ({
      objects: Array.isArray(f.objects)
        ? f.objects.map((o) => ({
            id: String(o.id),
            type: o.type === 'X' || o.type === 'Ball' ? o.type : 'O',
            label: o.label ?? '',
            x: Number(o.x) || 0,
            y: Number(o.y) || 0,
          }))
        : [],
      lines: Array.isArray(f.lines) ? f.lines : [],
      note: typeof f.note === 'string' ? f.note : '',
    })),
  };
}

export function loadPlaysFromStorage(): PlayData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPlayData).map(sanitizePlayData);
  } catch (e) {
    console.error('Failed to read saved plays from localStorage:', e);
    return [];
  }
}

export function savePlaysToStorage(plays: PlayData[]): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plays));
    return { ok: true };
  } catch (e) {
    console.error('Failed to write plays to localStorage:', e);
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      return { ok: false, error: '保存容量の上限に達しました。不要なプレイを削除してください。' };
    }
    return { ok: false, error: '保存に失敗しました。ブラウザのストレージ設定を確認してください。' };
  }
}

export function upsertPlayInStorage(
  play: PlayData,
  overwriteExisting: boolean
): { ok: boolean; plays: PlayData[]; savedPlay: PlayData; error?: string } {
  const existing = loadPlaysFromStorage();
  let savedPlay = sanitizePlayData(play);

  if (overwriteExisting) {
    const idx = existing.findIndex((p) => p.id === savedPlay.id);
    if (idx >= 0) {
      const next = [...existing];
      next.splice(idx, 1);
      next.unshift(savedPlay);
      const res = savePlaysToStorage(next);
      return { ok: res.ok, plays: res.ok ? next : existing, savedPlay, error: res.error };
    }
  } else {
    savedPlay = { ...savedPlay, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  }

  const next = [savedPlay, ...existing];
  const res = savePlaysToStorage(next);
  return { ok: res.ok, plays: res.ok ? next : existing, savedPlay, error: res.error };
}

export function deletePlayFromStorage(id: string): { ok: boolean; plays: PlayData[]; error?: string } {
  const existing = loadPlaysFromStorage();
  const next = existing.filter((p) => p.id !== id);
  const res = savePlaysToStorage(next);
  return { ok: res.ok, plays: res.ok ? next : existing, error: res.error };
}

// --- JSON Backup Export / Import ---
export function exportPlaysToJsonFile(plays: PlayData[], filenamePrefix = 'pro_playbook_backup'): void {
  const payload = {
    app: 'Pro Playbook',
    version: 1,
    exportedAt: new Date().toISOString(),
    plays,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safePrefix = filenamePrefix.trim().replace(/[\\/:*?"<>|\s]+/g, '_') || 'playbook';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safePrefix}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function importPlaysFromJsonText(jsonText: string): {
  ok: boolean;
  importedCount: number;
  plays: PlayData[];
  firstImported?: PlayData;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonText);
    let rawItems: unknown[] = [];

    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.plays)) {
      rawItems = parsed.plays;
    } else if (isValidPlayData(parsed)) {
      rawItems = [parsed];
    } else {
      return {
        ok: false,
        importedCount: 0,
        plays: loadPlaysFromStorage(),
        error: '有効なプレイブック JSON 形式ではありません',
      };
    }

    const validIncoming = rawItems.filter(isValidPlayData).map(sanitizePlayData);
    if (validIncoming.length === 0) {
      return {
        ok: false,
        importedCount: 0,
        plays: loadPlaysFromStorage(),
        error: '読み込めるプレイデータが含まれていませんでした',
      };
    }

    const existing = loadPlaysFromStorage();
    const byId = new Map<string, PlayData>(existing.map((p) => [p.id, p]));

    for (const incoming of validIncoming) {
      byId.set(incoming.id, incoming);
    }

    // Put newly imported items at the top
    const importedIds = new Set(validIncoming.map((p) => p.id));
    const remaining = existing.filter((p) => !importedIds.has(p.id));
    const merged = [...validIncoming, ...remaining];

    const saveRes = savePlaysToStorage(merged);
    if (!saveRes.ok) {
      return {
        ok: false,
        importedCount: 0,
        plays: existing,
        error: saveRes.error,
      };
    }

    return {
      ok: true,
      importedCount: validIncoming.length,
      plays: merged,
      firstImported: validIncoming[0],
    };
  } catch {
    return {
      ok: false,
      importedCount: 0,
      plays: loadPlaysFromStorage(),
      error: 'JSON ファイルの解析に失敗しました',
    };
  }
}
