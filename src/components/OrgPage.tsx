import { OrgWorkspacePanel } from './OrgWorkspacePanel'

/** Dedicated Organisation tab — role-specific owner / trainer / student views. */
export function OrgPage() {
  return (
    <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">
      <OrgWorkspacePanel layout="page" showWatchlists={false} />
    </div>
  )
}
