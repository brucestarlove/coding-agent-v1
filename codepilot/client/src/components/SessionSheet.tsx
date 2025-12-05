/**
 * SessionSheet Component
 * Full-width sliding sheet from top for session management
 * Displays sessions in a table with multi-select delete capability
 */

import { useState, useCallback, memo } from 'react';
import { useAgentStore, type SessionSummary } from '../store/useAgentStore';

/**
 * Format relative time from ISO date string
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `~${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `~${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Status badge component
 */
const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    idle: { label: 'ready_for_input', classes: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    running: { label: 'running', classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse' },
    completed: { label: 'ready_for_input', classes: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    failed: { label: 'failed', classes: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  };

  const { label, classes } = config[status] || config.idle;

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono border ${classes}`}>
      {label}
    </span>
  );
});

/**
 * Editable title cell
 */
const EditableTitle = memo(function EditableTitle({
  sessionId,
  title,
  preview,
}: {
  sessionId: string;
  title: string | null;
  preview: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title || '');
  const updateSessionTitle = useAgentStore((state) => state.updateSessionTitle);

  const displayValue = title || preview || 'Untitled';

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(title || preview || '');
    setIsEditing(true);
  }, [title, preview]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editValue.trim() && editValue !== title) {
      updateSessionTitle(sessionId, editValue.trim());
    }
  }, [editValue, title, sessionId, updateSessionTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(title || '');
    }
  }, [handleBlur, title]);

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className="
          w-full px-2 py-0.5 rounded
          bg-white/10 border border-violet-500/50
          text-white text-sm
          focus:outline-none focus:ring-1 focus:ring-violet-500
        "
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className="truncate cursor-text hover:text-white/90"
      title="Double-click to edit"
    >
      {displayValue}
    </span>
  );
});

/**
 * Session row component
 */
const SessionRow = memo(function SessionRow({
  session,
  isSelected,
  onSelect,
  onLoad,
}: {
  session: SessionSummary;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onLoad: (id: string) => void;
}) {
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect(session.id, e.target.checked);
  }, [session.id, onSelect]);

  const handleRowClick = useCallback(() => {
    onLoad(session.id);
  }, [session.id, onLoad]);

  return (
    <tr
      onClick={handleRowClick}
      className="
        hover:bg-white/5 cursor-pointer transition-colors
        border-b border-white/5 last:border-b-0
      "
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          className="
            w-4 h-4 rounded border-white/20 bg-white/5
            text-violet-500 focus:ring-violet-500 focus:ring-offset-0
          "
        />
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={session.status} />
      </td>

      {/* Working Directory */}
      <td className="px-4 py-3 text-white/50 font-mono text-xs truncate max-w-[200px]">
        {session.workingDir}
      </td>

      {/* Title */}
      <td className="px-4 py-3 text-white/70 max-w-[300px]">
        <EditableTitle
          sessionId={session.id}
          title={session.title}
          preview={session.preview}
        />
      </td>

      {/* Started */}
      <td className="px-4 py-3 text-white/40 text-sm whitespace-nowrap">
        {formatRelativeTime(session.createdAt)}
      </td>

      {/* Last Activity */}
      <td className="px-4 py-3 text-white/40 text-sm whitespace-nowrap">
        {formatRelativeTime(session.updatedAt)}
      </td>
    </tr>
  );
});

/**
 * Main SessionSheet component
 */
export function SessionSheet() {
  const isOpen = useAgentStore((state) => state.isSessionSheetOpen);
  const sessions = useAgentStore((state) => state.sessions);
  const setSessionSheetOpen = useAgentStore((state) => state.setSessionSheetOpen);
  const loadSession = useAgentStore((state) => state.loadSession);
  const deleteSession = useAgentStore((state) => state.deleteSession);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [sessions]);

  const handleLoad = useCallback((id: string) => {
    loadSession(id);
  }, [loadSession]);

  const handleDeleteSelected = useCallback(async () => {
    const idsToDelete = Array.from(selectedIds);
    for (const id of idsToDelete) {
      await deleteSession(id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, deleteSession]);

  const handleClose = useCallback(() => {
    setSessionSheetOpen(false);
    setSelectedIds(new Set());
  }, [setSessionSheetOpen]);

  if (!isOpen) return null;

  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length;
  const someSelected = selectedIds.size > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 top-0 z-50 animate-slide-down">
        <div className="
          bg-[hsl(222,84%,6%)]/95 backdrop-blur-xl
          border-b border-white/10
          shadow-2xl shadow-black/50
          max-h-[80vh] overflow-hidden flex flex-col
        ">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white/90">Sessions</h2>

              {/* Delete Selected button */}
              {someSelected && (
                <button
                  onClick={handleDeleteSelected}
                  className="
                    px-4 py-2 rounded-lg text-sm font-medium
                    bg-pink-500/20 border border-pink-500/30
                    text-pink-300 hover:bg-pink-500/30 hover:text-pink-200
                    transition-colors
                  "
                >
                  Delete Selected ({selectedIds.size})
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="
                p-2 rounded-lg
                text-white/50 hover:text-white/80 hover:bg-white/10
                transition-colors
              "
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-auto flex-1">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-white/40">
                No sessions yet
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-white/5 sticky top-0">
                  <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleSelectAll}
                        className="
                          w-4 h-4 rounded border-white/20 bg-white/5
                          text-violet-500 focus:ring-violet-500 focus:ring-offset-0
                        "
                      />
                    </th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Working Directory</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isSelected={selectedIds.has(session.id)}
                      onSelect={handleSelect}
                      onLoad={handleLoad}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

