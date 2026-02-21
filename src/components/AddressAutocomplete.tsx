'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Suggestion {
  id: string;
  fullAddress: string;
  street: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
  coordinates: { lat: number; lng: number };
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, coordinates?: { lat: number; lng: number }) => void;
  /** Bias results toward this point (e.g. event center) */
  proximity?: { lat: number; lng: number };
  placeholder?: string;
  required?: boolean;
  className?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

export default function AddressAutocomplete({
  value,
  onChange,
  proximity,
  placeholder = 'Storgatan 12, Piteå',
  required,
  className = '',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef(generateId());

  function generateId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  // Sync external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!MAPBOX_TOKEN || query.length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }

    const params = new URLSearchParams({
      q: query,
      country: 'se',
      language: 'sv',
      limit: '5',
      types: 'address',
      access_token: MAPBOX_TOKEN,
      session_token: sessionTokenRef.current,
    });

    if (proximity) {
      params.set('proximity', `${proximity.lng},${proximity.lat}`);
    }

    try {
      const res = await fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?${params}`
      );
      if (!res.ok) return;

      const data = await res.json();
      const features = data.features || [];

      const mapped: Suggestion[] = features.map((f: Record<string, unknown>) => {
        const props = f.properties as Record<string, unknown>;
        const coords = props.coordinates as Record<string, number>;
        const ctx = props.context as Record<string, Record<string, string>> || {};

        return {
          id: (props.mapbox_id as string) || String(Math.random()),
          fullAddress: (props.full_address as string) || '',
          street: (props.name as string) || '',
          houseNumber: (props.address_number as string) || undefined,
          postcode: ctx.postcode?.name || undefined,
          city: ctx.place?.name || ctx.locality?.name || undefined,
          coordinates: {
            lat: coords.latitude,
            lng: coords.longitude,
          },
        };
      });

      setSuggestions(mapped);
      setIsOpen(mapped.length > 0);
      setActiveIndex(-1);
    } catch {
      // Silent fail
    }
  }, [proximity]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val); // Update parent with raw text (no coords yet)

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS);
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    setInputValue(suggestion.fullAddress);
    onChange(suggestion.fullAddress, suggestion.coordinates);
    setSuggestions([]);
    setIsOpen(false);
    // New session token for next search
    sessionTokenRef.current = generateId();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `addr-opt-${activeIndex}` : undefined}
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`addr-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`px-4 py-3 cursor-pointer border-b border-amber-50 last:border-0 transition-colors ${
                i === activeIndex
                  ? 'bg-amber-50 text-amber-900'
                  : 'hover:bg-amber-50/50 text-gray-800'
              }`}
              onClick={() => selectSuggestion(s)}
            >
              <div className="font-medium text-sm">
                {s.street}{s.houseNumber ? ` ${s.houseNumber}` : ''}
              </div>
              <div className="text-xs text-gray-500">
                {[s.postcode, s.city].filter(Boolean).join(' ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
