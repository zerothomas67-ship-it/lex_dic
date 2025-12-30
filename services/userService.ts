
export interface UserSyncPayload {
  telegramId: string;
  name: string;
  username?: string;
  phoneNumber?: string;
}

export interface HistoryEntryPayload {
  telegramId: string;
  term: string;
  sourceLang: string;
  targetLang: string;
  category: string;
}

export const syncUserWithBackend = async (userData: UserSyncPayload): Promise<any> => {
  const response = await fetch('/api/user/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return response.json();
};

export const fetchUserProfile = async (telegramId: string): Promise<any> => {
  const response = await fetch(`/api/user/${telegramId}`);
  if (response.ok) return response.json();
  return null;
};

export const addXpToUser = async (telegramId: string, xp: number): Promise<boolean> => {
  const response = await fetch('/api/user/add-xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, xp }),
  });
  return response.ok;
};

export const saveSearchToBackend = async (entry: HistoryEntryPayload): Promise<boolean> => {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return response.ok;
};

export const fetchUserHistory = async (telegramId: string): Promise<any[]> => {
  const response = await fetch(`/api/history/${telegramId}`);
  if (response.ok) return response.json();
  return [];
};
