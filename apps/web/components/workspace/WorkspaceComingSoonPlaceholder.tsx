/**
 * WorkspaceComingSoonPlaceholder — temporary content for tabs that
 * are scaffolded in Phase A but built in Phase B/C of the redesign.
 *
 * Each placeholder tells the user three things:
 *   1. Which tab this is + a one-line description of what it'll do
 *   2. A short list of what's planned (so the user can decide if
 *      they want to wait or use the suggested alternative)
 *   3. A clear "use this instead for now" link
 *
 * Visual language mirrors the marketing-site card pattern
 * (`rounded-xl shadow-sm hover:lift` etc.) and the empty-state
 * primitives already used elsewhere — see
 * `apps/web/components/app/StatusBox.tsx` for the closest analog.
 *
 * Goes away in Phase B/C as each tab gets real content. The file
 * itself stays until the last placeholder is replaced, then we
 * delete it.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Construction } from 'lucide-react';

interface WorkspaceComingSoonPlaceholderProps {
  /** The tab's display name — e.g. "Subjects", "Structure". */
  tabName: string;
  /** What this tab will do, one sentence. */
  description: string;
  /** Optional icon shown next to the tab name. */
  icon?: LucideIcon;
  /** Bullet list of what the tab will include. */
  planned: readonly string[];
  /** Where the user should go in the meantime. */
  alternative: {
    label: string;
    href: string;
    description: string;
  };
}

export function WorkspaceComingSoonPlaceholder({
  tabName,
  description,
  icon: Icon = Construction,
  planned,
  alternative,
}: WorkspaceComingSoonPlaceholderProps) {
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-8">
      <div className="grid grid-cols-2 max-[840px]:grid-cols-1 gap-6">
        {/* Left: what this tab WILL be */}
        <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue"
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal">
                Coming soon
              </div>
              <h2 className="text-[20px] font-bold text-fg-primary leading-tight">
                {tabName}
              </h2>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-fg-secondary mb-4">
            {description}
          </p>
          {planned.length > 0 && (
            <>
              <div className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted mb-2">
                What this will include
              </div>
              <ul className="space-y-1.5 text-sm text-fg-secondary list-disc pl-5">
                {planned.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Right: what to do meanwhile */}
        <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            In the meantime
          </div>
          <h3 className="text-[18px] font-bold text-fg-primary mb-2 leading-tight">
            {alternative.label}
          </h3>
          <p className="text-sm leading-relaxed text-fg-secondary mb-4">
            {alternative.description}
          </p>
          <Link
            href={alternative.href}
            className="inline-flex items-center gap-1 text-sm font-semibold text-ndi-teal hover:text-ndi-primary transition-colors"
          >
            Open {alternative.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
