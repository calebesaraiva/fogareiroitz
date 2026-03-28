export type DiningTableAccess = {
  id: number;
  number: number;
  label: string | null;
  publicToken: string;
};

const DINE_IN_ACCESS_KEY = "fogareiro:dineInAccess";

export function getStoredDiningTableAccess(): DiningTableAccess | null {
  try {
    const raw = sessionStorage.getItem(DINE_IN_ACCESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DiningTableAccess;
  } catch {
    return null;
  }
}

export function saveDiningTableAccess(access: DiningTableAccess) {
  sessionStorage.setItem(DINE_IN_ACCESS_KEY, JSON.stringify(access));
}

export function clearDiningTableAccess() {
  sessionStorage.removeItem(DINE_IN_ACCESS_KEY);
}
