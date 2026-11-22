import { auth } from '../lib/firebase';
import { DifficultyLevel } from '../types/game';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  WalaKalimaContentTypeId,
  WalaKalimaCreateSessionResponse,
  WalaKalimaPlayerSessionState,
  WalaKalimaSessionPublicStatus,
  WalaKalimaSettings,
  WalaKalimaWordEntry,
} from '../types/walaKalima';

async function getAdminBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يرجى تسجيل الدخول بحساب المشرف أولاً.');
  }
  return user.getIdToken();
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.error || data.message || `خطأ من الخادم (HTTP ${res.status})`);
  }
  return data as T;
}

export async function fetchWalaKalimaPublicConfig(): Promise<WalaKalimaSettings> {
  try {
    const res = await fetch('/api/wala-kalima/config', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return DEFAULT_WALA_KALIMA_SETTINGS;
    return (await res.json()) as WalaKalimaSettings;
  } catch {
    return DEFAULT_WALA_KALIMA_SETTINGS;
  }
}

export async function createWalaKalimaRoundSession(params: {
  matchId: string;
  tileKey: string;
  teamId: string;
  teamName: string;
  playerName: string;
  contentType: WalaKalimaContentTypeId;
  preferredDifficulty?: DifficultyLevel;
}): Promise<WalaKalimaCreateSessionResponse> {
  const res = await fetch('/api/wala-kalima/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow<WalaKalimaCreateSessionResponse>(res);
}

export async function getWalaKalimaHostStatus(
  sessionId: string,
  hostSecret: string
): Promise<WalaKalimaSessionPublicStatus> {
  const res = await fetch(
    `/api/wala-kalima/sessions/${encodeURIComponent(sessionId)}/host-status`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'x-wk-host-secret': hostSecret,
      },
    }
  );
  return parseJsonOrThrow<WalaKalimaSessionPublicStatus>(res);
}

export function subscribeWalaKalimaHostStream(
  sessionId: string,
  hostSecret: string,
  onUpdate: (status: WalaKalimaSessionPublicStatus) => void,
  onError?: () => void
): () => void {
  const url = `/api/wala-kalima/sessions/${encodeURIComponent(
    sessionId
  )}/stream?hostSecret=${encodeURIComponent(hostSecret)}`;
  const es = new EventSource(url);

  es.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(evt.data) as WalaKalimaSessionPublicStatus;
      onUpdate(parsed);
    } catch {
      // ignore malformed heartbeat
    }
  };

  es.onerror = () => {
    if (onError) onError();
  };

  return () => {
    es.close();
  };
}

export async function hostActionWalaKalimaRound(
  sessionId: string,
  hostSecret: string,
  action: 'finish' | 'cancel'
): Promise<WalaKalimaSessionPublicStatus> {
  const res = await fetch(
    `/api/wala-kalima/sessions/${encodeURIComponent(sessionId)}/host-action`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wk-host-secret': hostSecret,
      },
      body: JSON.stringify({ action }),
    }
  );
  return parseJsonOrThrow<WalaKalimaSessionPublicStatus>(res);
}

export async function claimWalaKalimaQrRound(params: {
  sessionId: string;
  qrToken?: string;
  playerToken?: string;
}): Promise<WalaKalimaPlayerSessionState> {
  const res = await fetch(
    `/api/wala-kalima/sessions/${encodeURIComponent(params.sessionId)}/claim`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrToken: params.qrToken,
        playerToken: params.playerToken,
      }),
    }
  );
  return parseJsonOrThrow<WalaKalimaPlayerSessionState>(res);
}

export async function playerActionWalaKalimaRound(params: {
  sessionId: string;
  playerToken: string;
  action: 'correct' | 'skip' | 'finish' | 'sync';
}): Promise<WalaKalimaPlayerSessionState> {
  const res = await fetch(
    `/api/wala-kalima/sessions/${encodeURIComponent(params.sessionId)}/player-action`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.playerToken}`,
      },
      body: JSON.stringify({ action: params.action }),
    }
  );
  return parseJsonOrThrow<WalaKalimaPlayerSessionState>(res);
}

// =============================================================================
// Admin API Calls (Verified Firebase Admin ID Token Required)
// =============================================================================

export async function fetchAdminWalaKalimaData(): Promise<{
  settings: WalaKalimaSettings;
  words: WalaKalimaWordEntry[];
}> {
  const token = await getAdminBearerToken();
  const res = await fetch('/api/wala-kalima/admin/words', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJsonOrThrow<{ settings: WalaKalimaSettings; words: WalaKalimaWordEntry[] }>(res);
}

export async function createAdminWalaKalimaWordApi(payload: {
  word: string;
  forbiddenWords: string[];
  contentType: WalaKalimaContentTypeId;
  difficulty: DifficultyLevel;
  isActive: boolean;
}): Promise<WalaKalimaWordEntry> {
  const token = await getAdminBearerToken();
  const res = await fetch('/api/wala-kalima/admin/words', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<WalaKalimaWordEntry>(res);
}

export async function updateAdminWalaKalimaWordApi(
  wordId: string,
  payload: Partial<{
    word: string;
    forbiddenWords: string[];
    contentType: WalaKalimaContentTypeId;
    difficulty: DifficultyLevel;
    isActive: boolean;
  }>
): Promise<WalaKalimaWordEntry> {
  const token = await getAdminBearerToken();
  const res = await fetch(`/api/wala-kalima/admin/words/${encodeURIComponent(wordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<WalaKalimaWordEntry>(res);
}

export async function deleteAdminWalaKalimaWordApi(wordId: string): Promise<void> {
  const token = await getAdminBearerToken();
  const res = await fetch(`/api/wala-kalima/admin/words/${encodeURIComponent(wordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  await parseJsonOrThrow<{ ok: boolean }>(res);
}

export async function updateAdminWalaKalimaSettingsApi(
  payload: Partial<WalaKalimaSettings>
): Promise<WalaKalimaSettings> {
  const token = await getAdminBearerToken();
  const res = await fetch('/api/wala-kalima/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<WalaKalimaSettings>(res);
}
