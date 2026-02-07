const STORAGE_KEY = 'brickup_recent';
const MAX_RECENT = 10;

export interface RecentSession {
  slug: string;
  set_num: string;
  set_name: string;
  set_img_url: string | null;
  totalFound: number;
  totalNeeded: number;
  timestamp: number;
}

export function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function getRecentSessions(): RecentSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSession[];
  } catch {
    return [];
  }
}

export function saveRecentSession(session: Omit<RecentSession, 'timestamp'>): void {
  try {
    const list = getRecentSessions().filter((s) => s.slug !== session.slug);
    list.unshift({ ...session, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // localStorage might be unavailable
  }
}
