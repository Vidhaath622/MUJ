import { useEffect, useSyncExternalStore } from 'react';
import { PackId } from '../../../types/ragseal';
import { listPacks, PackInfo } from './apiExtra';

// Every pack the backend serves, loaded once per sign-in and shared by every picker. Until the
// list arrives (or if /api/packs fails) the five built-in packs stand in.

export interface PackOption {
  id: PackId;
  label: string;
  description?: string;
  questions?: number;
  documents?: number;
  group: string;
}

/** Picker sections in display order; a pack the map doesn't know lands in "Other". */
export const PACK_GROUPS = ['Demo bots (fictional)', 'Real-world (India)', 'Real public documents', 'About RAGSeal', 'Other'] as const;

const GROUP_OF: Record<string, (typeof PACK_GROUPS)[number]> = {
  banking: 'Demo bots (fictional)',
  healthcare: 'Demo bots (fictional)',
  recruitment: 'Demo bots (fictional)',
  income_tax_india: 'Real-world (India)',
  gst_india: 'Real-world (India)',
  gst_reform_overview: 'Real-world (India)',
  telecom_india: 'Real-world (India)',
  rishihood_rules: 'Real-world (India)',
  travel_jaipur_goa: 'Real-world (India)',
  realworld: 'Real public documents',
  synthetic_public: 'Real public documents',
  ragseal: 'About RAGSeal',
};

/** Order inside a group; unknown packs follow, alphabetically. */
const ORDER = Object.keys(GROUP_OF);

export const groupOf = (id: string) => GROUP_OF[id] ?? 'Other';

const FALLBACK: PackOption[] = [
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'banking', label: 'Banking' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'realworld', label: 'Real documents' },
  { id: 'ragseal', label: 'RAGSeal guide' },
].map((p) => ({ ...p, group: groupOf(p.id) }));

/** Display names by pack id, kept current as the list loads (see PACK_LABEL in ui.tsx). */
export const PACK_NAMES: Record<string, string> = Object.fromEntries(FALLBACK.map((p) => [p.id, p.label]));

let current: PackOption[] = FALLBACK;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function sortPacks(packs: PackOption[]): PackOption[] {
  const rank = (p: PackOption) => {
    const i = ORDER.indexOf(p.id);
    return i === -1 ? ORDER.length : i;
  };
  return [...packs].sort(
    (a, b) => PACK_GROUPS.indexOf(a.group as never) - PACK_GROUPS.indexOf(b.group as never) || rank(a) - rank(b) || a.label.localeCompare(b.label)
  );
}

function publish(info: PackInfo[]) {
  current = sortPacks(
    info.map((p) => ({
      id: p.pack_id,
      label: p.name || p.pack_id,
      description: p.description,
      questions: p.test_case_count,
      documents: p.document_count,
      group: groupOf(p.pack_id),
    }))
  );
  for (const p of current) PACK_NAMES[p.id] = p.label;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Loads the pack list for this token (once per token). Call it near the app root. */
export function useLoadPacks(token: string | null) {
  useEffect(() => {
    if (!token || loadedFor === token) return;
    loadedFor = token;
    listPacks(token)
      .then((info) => Array.isArray(info) && info.length && publish(info))
      .catch(() => {
        // Keep the built-in five; try again on the next sign-in.
        loadedFor = null;
      });
  }, [token]);
}

/** The current pack list; re-renders when it loads. */
export function usePacks(): PackOption[] {
  return useSyncExternalStore(subscribe, () => current);
}

/** A pack's display name, or its id when it isn't known yet. */
export const packLabel = (id: string | null | undefined) => (id ? PACK_NAMES[id] ?? id : '');
