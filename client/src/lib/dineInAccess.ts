export type DiningTableAccess = {
  id: number;
  number: number;
  label: string | null;
  publicToken: string;
};

const DINE_IN_ACCESS_KEY = "fogareiro:dineInAccess";

export function getStoredDiningTableAccess(): DiningTableAccess | null {
  try {
    const raw = localStorage.getItem(DINE_IN_ACCESS_KEY) ?? sessionStorage.getItem(DINE_IN_ACCESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DiningTableAccess;
  } catch {
    return null;
  }
}

export function saveDiningTableAccess(access: DiningTableAccess) {
  localStorage.setItem(DINE_IN_ACCESS_KEY, JSON.stringify(access));
  sessionStorage.setItem(DINE_IN_ACCESS_KEY, JSON.stringify(access));
}

export function clearDiningTableAccess() {
  localStorage.removeItem(DINE_IN_ACCESS_KEY);
  sessionStorage.removeItem(DINE_IN_ACCESS_KEY);
}
