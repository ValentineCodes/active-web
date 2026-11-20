import Link from 'next/link';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';

import { StatusBadge } from '@/components/admin/status-badge';
import { requireAdminSessionForPath } from '@/lib/admin/session';
import { fetchAdminProject } from '@/lib/admin/projects';
import { formatNgnFromKobo } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  await requireAdminSessionForPath('/projects');
  const { id } = await params;

  let data: Awaited<ReturnType<typeof fetchAdminProject>>;
  try {
    data = await fetchAdminProject(id);
  } catch {
    notFound();
  }

  const project = data.project as Record<string, unknown>;
  const pool = data.pool as Record<string, number>;
  const assignments = (data.assignments ?? []) as Array<Record<string, unknown>>;
  const disputes = (data.disputes ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-brand hover:text-brand-dark">
          ← Projects
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{project.title as string}</h2>
        <p className="text-sm text-muted">{id}</p>
      </div>

      {typeof data.refund_note === 'string' ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          {data.refund_note}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={project.status as string} />
          <StatusBadge status={project.funding_status as string} />
        </div>
        <p className="mt-3 text-sm text-ink">{project.description as string}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted">Creator</dt>
            <dd>
              <Link href={`/users/${project.creator_id as string}`} className="text-brand">
                {project.creator_name as string}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Budget</dt>
            <dd>{formatNgnFromKobo(project.budget_total_kobo as number)}</dd>
          </div>
          <div>
            <dt className="text-muted">Contributed</dt>
            <dd>{formatNgnFromKobo(pool.contributed_total_kobo ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Reserved</dt>
            <dd>{formatNgnFromKobo(pool.reserved_total_kobo ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Committed compensation</dt>
            <dd>{formatNgnFromKobo(pool.committed_compensation_kobo ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Contributions</dt>
            <dd>{String(data.contribution_count ?? 0)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Assignments</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {assignments.length === 0 ? (
            <li className="text-muted">No assignments.</li>
          ) : (
            assignments.map((row) => (
              <li key={row.id as string} className="flex flex-wrap gap-2">
                <StatusBadge status={row.status as string} />
                <span>{row.worker_name as string}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Assignment disputes</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {disputes.length === 0 ? (
            <li className="text-muted">No disputes recorded.</li>
          ) : (
            disputes.map((row) => (
              <li key={row.id as string}>
                <StatusBadge status={row.status as string} />
                <p className="mt-1 text-muted">{row.description as string}</p>
                <p className="text-xs text-subtle">
                  {format(new Date(row.created_at as string), 'PPpp')}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}