/**
 * `/datasets/[id]/tables` — server redirect to `./tables/subject`.
 *
 * The Summary tables tab opens on the `subject` class by default
 * (matches the data-browser's tables-with-no-class → tables/subject
 * convention). Server-side redirect via Next's `redirect()` so the
 * 308 happens before HTML ships — no client-side flash.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TablesIndexPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/datasets/${id}/tables/subject`);
}
