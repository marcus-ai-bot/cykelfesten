'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Syncs a tab/phase state with ?tab= URL param for browser back button support.
 * Returns [currentTab, setTab] similar to useState.
 */
export function useTabParam<T extends string>(defaultTab: T, paramName = 'tab'): [T, (tab: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentTab = (searchParams.get(paramName) as T) || defaultTab;

  const setTab = useCallback((tab: T) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === defaultTab) {
      params.delete(paramName);
    } else {
      params.set(paramName, tab);
    }
    const query = params.toString();
    router.push(`${pathname}${query ? '?' + query : ''}`, { scroll: false });
  }, [searchParams, router, pathname, defaultTab, paramName]);

  return [currentTab, setTab];
}
