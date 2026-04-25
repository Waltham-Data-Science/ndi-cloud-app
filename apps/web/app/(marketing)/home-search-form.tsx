'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { commonsSearchUrl } from '@/lib/urls';

/**
 * Hero search form (client island).
 *
 * Submitting takes the user to /datasets?q=<query>. In the source repo
 * this was a `window.location.href` cross-domain navigation to
 * `app.ndi-cloud.com`; post-unification it's a same-origin
 * router.push.
 */
export function HomeSearchForm() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(commonsSearchUrl(query.trim() || undefined));
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="max-w-[680px] mx-auto w-full"
    >
      <label htmlFor="home-search" className="sr-only">
        Search NDI Data Commons
      </label>
      <div className="flex items-center gap-2 bg-white/8 backdrop-blur-sm border border-white/15 rounded-pill p-2 transition-colors focus-within:bg-white/12 focus-within:border-white/30">
        <span className="pl-3 text-white/70" aria-hidden>
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l4 4" />
          </svg>
        </span>
        <input
          id="home-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: V1 drifting gratings, M. musculus hippocampus, whole-cell..."
          className="flex-1 bg-transparent border-0 outline-0 text-white placeholder:text-white/40 text-sm py-1.5 px-2 min-w-0"
        />
        <button
          type="submit"
          className="shrink-0 bg-ndi-teal text-white font-semibold text-sm px-5 py-2 rounded-pill shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out)"
        >
          Search the commons
        </button>
      </div>
    </form>
  );
}
