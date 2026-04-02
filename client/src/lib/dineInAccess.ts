export type DiningTableAccess = {
  id: number;
  number: number;
  label: string | null;
  accessToken: string;
  expiresAt: number;
};

const DINE_IN_ACCESS_KEY = "fogareiro:dineInAccess";

export function getStoredDiningTableAccess(): DiningTableAccess | null {
  try {
    const raw = localStorage.getItem(DINE_IN_ACCESS_KEY) ?? sessionStorage.getItem(DINE_IN_ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DiningTableAccess>;
    if (
      typeof parsed?.id !== "number" ||
      typeof parsed?.number !== "number" ||
      typeof parsed?.accessToken !== "string" ||
      typeof parsed?.expiresAt !== "number"
    ) {
      clearDiningTableAccess();
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      clearDiningTableAccess();
      return null;
    }

    return {
      id: parsed.id,
      number: parsed.number,
      label: parsed.label ?? null,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
    };
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
