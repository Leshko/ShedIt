'use client';

import { useShedStore } from '../lib/store';

/**
 * Issues carry their own remedies as field assignments, so every fix button is
 * rendered generically here rather than needing per-error UI code.
 */
export function IssueList() {
  const plan = useShedStore((s) => s.plan);
  const applyFix = useShedStore((s) => s.applyFix);
  const error = useShedStore((s) => s.error);

  if (error) return <div className="error-banner">{error}</div>;
  if (!plan?.issues.length) return null;

  const order = { error: 0, warning: 1, notice: 2 } as const;
  const issues = [...plan.issues].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="section">
      {issues.map((issue, i) => (
        <div className={`issue ${issue.severity}`} key={`${issue.code}-${i}`}>
          <div>{issue.message}</div>
          {issue.fixes?.length ? (
            <div className="fixes">
              {issue.fixes.map((fix) => (
                <button key={fix.label} onClick={() => applyFix(fix.ops)}>
                  {fix.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
