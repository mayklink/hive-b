import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Paperclip, AlertCircle, Trash2, Archive, ArchiveRestore, GitBranch, ExternalLink, X, FileText, Pin, PinOff, RefreshCw, Link as LinkIcon, GitPullRequest, Loader2, Sparkles } from 'lucide-react'
import { UpdateStatusModal } from './UpdateStatusModal'
import { cn } from '@/lib/utils'
import { ProviderIcon, getProviderLabel } from '@/components/ui/provider-icon'
import { toast } from '@/lib/toast'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem
} from '@/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog'
import { WorktreePickerModal } from '@/components/kanban/WorktreePickerModal'
import { Popover, PopoverAnchor } from '@/components/ui/popover'
import { AttachPRPopover } from '@/components/kanban/AttachPRPopover'
import { useGitStore } from '@/stores/useGitStore'
import { IndeterminateProgressBar } from '@/components/sessions/IndeterminateProgressBar'
import { PulseAnimation } from '@/components/worktrees/PulseAnimation'
import { useSessionStore } from '@/stores/useSessionStore'
import { useWorktreeStore } from '@/stores/useWorktreeStore'
import { setKanbanDragData, useKanbanStore } from '@/stores/useKanbanStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useScriptStore } from '@/stores/useScriptStore'
import { useWorktreeStatusStore } from '@/stores/useWorktreeStatusStore'
import { useQuestionStore } from '@/stores/useQuestionStore'
import { usePinnedStore } from '@/stores/usePinnedStore'
import { useFileViewerStore } from '@/stores/useFileViewerStore'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { useSessionTokenDelta } from '@/hooks/useSessionTokenDelta'
import { formatTokenCount } from '@/lib/format-utils'
import type { KanbanTicket, TicketMark } from '../../../../main/db/types'

// ── Project tag color palette ──────────────────────────────────────
const PROJECT_TAG_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
]

/** Deterministic color for a project within a connection's project list. */
function getProjectColor(projectId: string, connectionProjectIds: string[]): string {
  const idx = connectionProjectIds.indexOf(projectId)
  if (idx === -1) return PROJECT_TAG_COLORS[0]
  return PROJECT_TAG_COLORS[idx % PROJECT_TAG_COLORS.length]
}

interface KanbanTicketCardProps {
  ticket: KanbanTicket
  /** Position index within the column (used for drag transfer data) */
  index?: number
  /** Whether this ticket is archived (shown in archived section) */
  isArchived?: boolean
  /** When viewing a connection board, the connection ID for project tag + jump-to-session */
  connectionId?: string
  /** When viewing the pinned board (multi-project), show project tags */
  isPinnedMode?: boolean
}

export const KanbanTicketCard = memo(function KanbanTicketCard({
  ticket,
  index = 0,
  isArchived = false,
  connectionId,
  isPinnedMode
}: KanbanTicketCardProps) {
  const isMultiProjectMode = !!connectionId || !!isPinnedMode

  const [isDragging, setIsDragging] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showWorktreePicker, setShowWorktreePicker] = useState(false)
  const [showPreAssignPicker, setShowPreAssignPicker] = useState(false)
  const [showStatusUpdate, setShowStatusUpdate] = useState(false)
  const [showPRPicker, setShowPRPicker] = useState(false)
  const isExternalTicket = !!ticket.external_provider
  const dragCloneRef = useRef<HTMLElement | null>(null)

  // ── Lookup worktree name ────────────────────────────────────────
  const worktreeName = useWorktreeStore(
    useCallback(
      (state) => {
        if (!ticket.worktree_id) return null
        for (const worktrees of state.worktreesByProject.values()) {
          const found = worktrees.find((w) => w.id === ticket.worktree_id)
          if (found) return found.name
        }
        return null
      },
      [ticket.worktree_id]
    )
  )

  // ── Lookup project name + color for connection board ─────────────
  // Selector returns a primitive (string | null) to avoid Zustand infinite
  // re-render loops caused by new object references on every evaluation.
  const projectName = useProjectStore(
    useCallback(
      (state) => {
        if (!isMultiProjectMode) return null
        return state.projects.find((p) => p.id === ticket.project_id)?.name ?? null
      },
      [isMultiProjectMode, ticket.project_id]
    )
  )

  const projectTag = useMemo(() => {
    if (!projectName) return null
    if (connectionId) {
      const connectionProjectIds = useKanbanStore.getState().getConnectionProjectIds(connectionId)
      return {
        name: projectName,
        color: getProjectColor(ticket.project_id, connectionProjectIds)
      }
    }
    if (isPinnedMode) {
      const pinnedProjectIds = useKanbanStore.getState().getPinnedProjectIdsArray()
      return {
        name: projectName,
        color: getProjectColor(ticket.project_id, pinnedProjectIds)
      }
    }
    return null
  }, [connectionId, isPinnedMode, projectName, ticket.project_id])

  // ── Detect connection session on project board ──────────────────
  // Selector returns a primitive (string | null) to avoid Zustand infinite
  // re-render loops caused by new object references on every evaluation.
  const connectionSessionId = useSessionStore(
    useCallback(
      (state) => {
        if (!ticket.current_session_id || connectionId) return null
        for (const [connId, sessions] of state.sessionsByConnection.entries()) {
          if (sessions.some((s) => s.id === ticket.current_session_id)) return connId
        }
        return null
      },
      [ticket.current_session_id, connectionId]
    )
  )

  const connectionSession = connectionSessionId ? { connectionId: connectionSessionId } : null

  // ── Lookup connection name for project board badge ─────────────
  const connectionName = useConnectionStore(
    useCallback(
      (state) => {
        if (!connectionSession) return null
        const conn = state.connections.find((c) => c.id === connectionSession.connectionId)
        return conn?.custom_name || conn?.name || null
      },
      [connectionSession]
    )
  )

  // ── Lookup linked session status ────────────────────────────────
  const sessionStatus = useSessionStore(
    useCallback(
      (state) => {
        if (!ticket.current_session_id) return null
        for (const sessions of state.sessionsByWorktree.values()) {
          const found = sessions.find((s) => s.id === ticket.current_session_id)
          if (found) return found.status
        }
        for (const sessions of state.sessionsByConnection.values()) {
          const found = sessions.find((s) => s.id === ticket.current_session_id)
          if (found) return found.status
        }
        return null
      },
      [ticket.current_session_id]
    )
  )

  // ── Real-time "agent is busy" from worktree status store ────────
  const isBusy = useWorktreeStatusStore(
    useCallback(
      (state) => {
        if (!ticket.current_session_id) return false
        const entry = state.sessionStatuses[ticket.current_session_id]
        return entry?.status === 'working' || entry?.status === 'planning'
      },
      [ticket.current_session_id]
    )
  )

  // ── Detect pending questions for this ticket's session ─────────
  const isAsking = useQuestionStore(
    useCallback(
      (state) => {
        if (!ticket.current_session_id) return false
        const questions = state.pendingBySession.get(ticket.current_session_id)
        return (questions?.length ?? 0) > 0
      },
      [ticket.current_session_id]
    )
  )

  const timerText = useSessionTimer(
    ticket.current_session_id,
    (isBusy || isAsking) && ticket.column === 'in_progress'
  )

  // Accumulated total for done column
  const doneTokenText = ticket.column === 'done' && ticket.total_tokens > 0
    ? formatTokenCount(ticket.total_tokens)
    : null

  // Per-turn delta for active columns (unchanged)
  const turnTokenText = useSessionTokenDelta(
    ticket.current_session_id,
    (isBusy || isAsking) && ticket.column === 'in_progress'
  )

  // Done column shows accumulated total; everything else shows per-turn delta
  const tokenText = doneTokenText ?? turnTokenText

  // ── Detect if the linked worktree has a live run process ──────
  const isRunProcessAlive = useScriptStore(
    useCallback(
      (s) => {
        if (!ticket.worktree_id) return false
        return s.scriptStates[ticket.worktree_id]?.runRunning ?? false
      },
      [ticket.worktree_id]
    )
  )

  // ── Pin state for the assigned worktree ─────────────────────────
  const isPinned = usePinnedStore(
    useCallback(
      (s) => (ticket.worktree_id ? s.pinnedWorktreeIds.has(ticket.worktree_id) : false),
      [ticket.worktree_id]
    )
  )

  // Reads worktree list snapshot — reactive only to remoteInfo changes, not worktree additions.
  const hasGitRemote = useGitStore(
    useCallback(
      (state) => {
        const worktrees = useWorktreeStore.getState().worktreesByProject.get(ticket.project_id)
        if (!worktrees) return false
        return worktrees.some((wt) => {
          const info = state.remoteInfo.get(wt.id)
          return info?.hasRemote === true && info.isGitHub === true
        })
      },
      [ticket.project_id]
    )
  )

  const isCreatingPR = useGitStore(
    useCallback(
      (s) => ticket.worktree_id ? s.creatingPRByWorktreeId.get(ticket.worktree_id) === true : false,
      [ticket.worktree_id]
    )
  )

  const isActive = sessionStatus === 'active'
  const isError = sessionStatus === 'error'
  const hasAttachments = ticket.attachments.length > 0

  // ── Border state computation ────────────────────────────────────
  const borderState = useMemo(() => {
    if (ticket.column !== 'in_progress') return 'default'
    if (ticket.plan_ready) return 'violet'
    if (ticket.current_session_id && ticket.mode === 'build') return 'blue'
    if (ticket.current_session_id && ticket.mode === 'plan') return 'violet'
    if (ticket.current_session_id && ticket.mode === 'super-plan') return 'violet'
    return 'default'
  }, [ticket.column, ticket.mode, ticket.plan_ready, ticket.current_session_id])

  // ── Drag handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Store drag data
      setKanbanDragData({ ticketId: ticket.id, sourceColumn: ticket.column, sourceIndex: index })
      e.dataTransfer.setData('text/plain', ticket.id)
      e.dataTransfer.effectAllowed = 'move'

      // Create rotated clone for drag image
      const el = e.currentTarget as HTMLElement
      const clone = el.cloneNode(true) as HTMLElement
      clone.style.width = `${el.offsetWidth}px`
      clone.style.transform = 'rotate(3deg)'
      clone.style.position = 'fixed'
      clone.style.top = '-9999px'
      clone.style.left = '-9999px'
      clone.style.pointerEvents = 'none'
      clone.style.zIndex = '9999'
      document.body.appendChild(clone)
      e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2)
      dragCloneRef.current = clone

      // Clean up clone after browser captures it — double-rAF ensures
      // Chromium/Electron has finished reading the drag image before removal
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (dragCloneRef.current) {
            dragCloneRef.current.remove()
            dragCloneRef.current = null
          }
        })
      })

      setIsDragging(true)
    },
    [ticket.id, ticket.column, index]
  )

  const handleDragEnd = useCallback(() => {
    // Safety cleanup
    if (dragCloneRef.current) {
      dragCloneRef.current.remove()
      dragCloneRef.current = null
    }
    setKanbanDragData(null)
    setIsDragging(false)
  }, [])

  // ── Click handler — open ticket detail modal ───────────────────
  const handleClick = useCallback(() => {
    useKanbanStore.getState().setSelectedTicketId(ticket.id)
  }, [ticket.id])

  // ── Middle-click — select attached worktree (same as sidebar) ─
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1) return            // only middle-click
      if (!ticket.worktree_id) return        // no-op for unassigned tickets
      if (isArchived) return                 // no-op for archived tickets
      e.preventDefault()                     // suppress browser auto-scroll

      // Select worktree — same as sidebar's WorktreeItem.handleClick
      useWorktreeStore.getState().selectWorktree(ticket.worktree_id)
      useProjectStore.getState().selectProject(ticket.project_id)
      useWorktreeStatusStore.getState().clearWorktreeUnread(ticket.worktree_id)
    },
    [ticket.worktree_id, ticket.project_id, isArchived]
  )

  const isDone = ticket.column === 'done'

  // ── Context menu handlers ─────────────────────────────────────
  const handleDelete = useCallback(async () => {
    try {
      await useKanbanStore.getState().deleteTicket(ticket.id, ticket.project_id)
      toast.success('Ticket deleted')
    } catch {
      toast.error('Failed to delete ticket')
    }
    setShowDeleteConfirm(false)
  }, [ticket.id, ticket.project_id])

  const handleArchive = useCallback(async () => {
    try {
      await useKanbanStore.getState().archiveTicket(ticket.id, ticket.project_id)
      toast.success('Ticket archived')
    } catch {
      toast.error('Failed to archive ticket')
    }
  }, [ticket.id, ticket.project_id])

  const handleUnarchive = useCallback(async () => {
    try {
      await useKanbanStore.getState().unarchiveTicket(ticket.id, ticket.project_id)
      toast.success('Ticket unarchived')
    } catch {
      toast.error('Failed to unarchive ticket')
    }
  }, [ticket.id, ticket.project_id])

  const handleJumpToSession = useCallback(() => {
    if (!ticket.current_session_id) return
    const kanbanStore = useKanbanStore.getState()
    if (kanbanStore.isBoardViewActive) kanbanStore.toggleBoardView()
    if (kanbanStore.isPinnedBoardActive) kanbanStore.togglePinnedBoard()
    if (connectionId) {
      // Connection mode: navigate to the connection and set session
      useConnectionStore.getState().selectConnection(connectionId)
      useSessionStore.getState().setActiveConnection(connectionId)
      useSessionStore.getState().setActiveSession(ticket.current_session_id)
    } else {
      // Project mode: navigate to the worktree/connection and set session
      if (connectionSession) {
        // Ticket has a connection session — navigate to connection context
        useConnectionStore.getState().selectConnection(connectionSession.connectionId)
        useSessionStore.getState().setActiveConnection(connectionSession.connectionId)
        useSessionStore.getState().setActiveSession(ticket.current_session_id)
      } else if (ticket.worktree_id) {
        useWorktreeStore.getState().selectWorktree(ticket.worktree_id)
        useSessionStore.getState().setActiveWorktree(ticket.worktree_id)
        useSessionStore.getState().setActiveSession(ticket.current_session_id)
      } else {
        // In pinned mode the current project context may not match the ticket's project;
        // navigate to it so the user lands in the right project.
        if (isPinnedMode && ticket.project_id) {
          useProjectStore.getState().selectProject(ticket.project_id)
        }
        useSessionStore.getState().setActiveSession(ticket.current_session_id)
      }
    }
  }, [ticket.current_session_id, ticket.worktree_id, ticket.project_id, connectionId, connectionSession, isPinnedMode])

  const isSimpleTicket = ticket.current_session_id === null
  const isFlowTicket = ticket.current_session_id !== null
  const isTodo = ticket.column === 'todo'

  const handleUnassignWorktree = useCallback(async () => {
    try {
      await useKanbanStore.getState().updateTicket(ticket.id, ticket.project_id, {
        worktree_id: null
      })
      toast.success('Worktree unassigned')
    } catch {
      toast.error('Failed to unassign worktree')
    }
  }, [ticket.id, ticket.project_id])

  const handleTogglePin = useCallback(async () => {
    if (!ticket.worktree_id) return
    if (isPinned) {
      await usePinnedStore.getState().unpinWorktree(ticket.worktree_id)
    } else {
      await usePinnedStore.getState().pinWorktree(ticket.worktree_id)
    }
  }, [isPinned, ticket.worktree_id])

  const handleEditContext = useCallback(() => {
    if (!ticket.worktree_id) return
    useFileViewerStore.getState().openContextEditor(ticket.worktree_id)
  }, [ticket.worktree_id])

  const handleMarkChange = useCallback(async (value: string) => {
    try {
      await useKanbanStore.getState().updateTicket(ticket.id, ticket.project_id, {
        mark: value === 'none' ? null : value as TicketMark
      })
    } catch {
      toast.error('Failed to update ticket mark')
    }
  }, [ticket.id, ticket.project_id])

  return (
    <>
      <Popover open={showPRPicker} onOpenChange={setShowPRPicker}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <PopoverAnchor asChild>
              <div
                data-testid={`kanban-ticket-${ticket.id}`}
                draggable={!isArchived}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                className={cn(
                  'group cursor-pointer rounded-md border bg-card shadow-sm p-2 transition-all duration-200',
                  'hover:bg-muted/40',
                  isDragging && 'invisible',
                  isArchived && 'opacity-50 cursor-default',
                  borderState === 'default' && 'border-border/60',
                  borderState === 'blue' && 'border-blue-500/60',
                  borderState === 'violet' && 'border-violet-500/60',
                  // Left accent stripe for non-legendary marks
                  ticket.mark === 'common' && 'border-l-4 !border-l-green-500',
                  ticket.mark === 'rare' && 'border-l-4 !border-l-blue-500',
                  ticket.mark === 'epic' && 'border-l-4 !border-l-purple-500',
                  // Legendary: extra padding + relative for frame overlay
                  ticket.mark === 'legendary' && 'relative p-3'
                )}
              >
            {/* Dragon frame overlay for legendary tickets */}
            {ticket.mark === 'legendary' && (
              <svg
                className={cn(
                  'absolute inset-0 w-full h-full pointer-events-none',
                  ticket.mode === 'build' ? 'text-blue-500' :
                  (ticket.mode === 'plan' || ticket.mode === 'super-plan') ? 'text-violet-500' :
                  'text-gray-400'
                )}
                viewBox="0 0 400 300"
                fill="none"
                preserveAspectRatio="none"
              >
                {/* Outer frame */}
                <rect x="8" y="8" width="384" height="284" rx="8" ry="8" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.85" />
                <rect x="14" y="14" width="372" height="272" rx="5" ry="5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />

                {/* Dragon silhouette watermark (uxwing.com, public domain) */}
                <defs>
                  <clipPath id="dragonFrameClip">
                    <rect x="8" y="8" width="384" height="284" rx="8" ry="8" />
                  </clipPath>
                </defs>
                <g clipPath="url(#dragonFrameClip)">
                  <g transform="translate(220, 10) scale(-2.8, 2.8) translate(-61.44, 0)" opacity="0.12">
                    <path d="M52.4,20.33C60.04,15.89,63.76,8.53,68.19,0c2.26,2.44,3.48,8.44,2.98,16.83c21.29-1.39,34.78,10.58,51.71-7.42C115.6,37.52,89.32,21.55,78.34,24c16.95,1.92,21.76,11.28,41.28,7.96c-6.72,8.09-21.59,6.45-34.11,0.75c2.21,6.08,24.83,10.01,20.22,28.16c-4.36-7.49-8.45-12.09-12.29-14.08c7.91,13.68,7.29,26.15-0.09,39.78c-1.63,3-3.62,5.73-6.05,8.09c3.38-7.47,5.02-14.43,3.58-20.48c-1.37,5.2-26.98,55.76-13.31,14.34C50.27,115.34,23.7,88.04,0,106.68c7.91-37.07,50.98-22.56,66.84-39.74c3.26-3.54,4.44-8.33,3.04-11.78c-4.08-10.04-18.37-7.09-23.55-0.96c-3.19,4.91-9.37,10.37-14.44,4.29c-0.83-0.99-1.3-2.26-1.43-3.78c2.56,1.09,5.12,1.51,7.68,0.26l-2.05-2.3c2.73-0.77,5.78,0.09,8.19-2.42l8.96-5.89c1.71-1.26-2.13-2.07-11.26-2.7c-0.77,1.99-0.42,3.81,1.79,5.38c-2.62,0.35-4.89-0.35-6.66-2.56c-1.04,0.81-0.89,1.38,1.9,5.81c-2.51,0.11-5.02-0.89-7.53-2.48c-0.58,2.02,0.27,4.04,0.41,6.06c-1.83-0.53-3.51-1.4-5.02-2.62c-1.52-1.23-2.89-2.8-4.09-4.72c-0.83-1.88-0.82-3.29-0.18-4.34c0.39-0.65,1.02-1.16,1.85-1.57c3.1-1.53,4.66-1.35,8.29-3.77c3.43-2.28,6.93-5.01,9.91-8.69C47.47,22.2,47.34,23.27,52.4,20.33L52.4,20.33z M51.69,29.57c-1.19,0.49-1.28,1.07-2.92,1.52c-0.49,0.13-1.35,0.87-1.62,1.3c-0.84,1.37,2.22,2.1,3.14,0.46c0.23-0.4,1.26-2.3,1.34-2.53c0.08-0.24,0.29-0.43,0.13-0.7C51.74,29.62,51.73,29.56,51.69,29.57L51.69,29.57z" fill="currentColor" fillRule="evenodd" />
                  </g>
                </g>

                {/* Left side scales */}
                <path d="M8 40 C0 70, 8 100, 8 130 C8 160, 0 190, 8 220 C8 250, 8 270, 8 280" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.35" />
                <path d="M4 70 L-4 82 L4 94" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M4 130 L-4 142 L4 154" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M4 190 L-4 202 L4 214" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M4 250 L-4 262 L4 274" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />

                {/* Right side scales */}
                <path d="M392 40 C400 70, 392 100, 392 130 C392 160, 400 190, 392 220 C392 250, 392 270, 392 280" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.35" />
                <path d="M396 70 L404 82 L396 94" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M396 130 L404 142 L396 154" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M396 190 L404 202 L396 214" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />
                <path d="M396 250 L404 262 L396 274" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.25" />

                {/* Bottom gem */}
                <path d="M200 278 L214 294 L200 310 L186 294 Z" fill="currentColor" opacity="0.5" />
                <path d="M200 282 L210 294 L200 306 L190 294 Z" fill="currentColor" opacity="0.2" />
                <circle cx="200" cy="294" r="20" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.2" />
                <path d="M60 290 C100 300, 140 282, 186 294" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
                <path d="M214 294 C260 282, 300 300, 340 290" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />

                {/* Corner rivets */}
                <circle cx="18" cy="18" r="4" fill="currentColor" opacity="0.4" />
                <circle cx="382" cy="18" r="4" fill="currentColor" opacity="0.4" />
                <circle cx="18" cy="282" r="4" fill="currentColor" opacity="0.4" />
                <circle cx="382" cy="282" r="4" fill="currentColor" opacity="0.4" />
              </svg>
            )}
            {/* Title + top-right indicators */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug text-foreground min-w-0">{ticket.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                {tokenText && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {tokenText}
                  </span>
                )}
                {ticket.external_provider && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (ticket.external_url) {
                        window.systemOps.openInChrome(ticket.external_url)
                      }
                    }}
                    className="transition-opacity hover:opacity-80"
                    title={`${getProviderLabel(ticket.external_provider)} #${ticket.external_id}`}
                  >
                    <ProviderIcon provider={ticket.external_provider} />
                  </button>
                )}
              </div>
            </div>

            {/* Badges + progress row */}
            {(hasAttachments || worktreeName || projectTag || connectionName || ticket.plan_ready || isError || isBusy || isAsking || isArchived || isRunProcessAlive || ticket.github_pr_number || isCreatingPR) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {/* Archived badge */}
                {isArchived && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Archive className="h-3 w-3" />
                    Archived
                  </span>
                )}
                {/* Attachment badge */}
                {hasAttachments && (
                  <span
                    data-testid="kanban-ticket-attachments"
                    className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <Paperclip className="h-3 w-3" />
                    {ticket.attachments.length}
                  </span>
                )}

                {/* Project tag (connection mode) or worktree name badge */}
                {projectTag ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: projectTag.color }} />
                    {projectTag.name}
                  </span>
                ) : worktreeName ? (
                  <span className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {worktreeName}
                  </span>
                ) : null}

                {/* Connection badge — shown on project board when ticket has connection session */}
                {!connectionId && connectionName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <LinkIcon className="h-3 w-3" />
                    {connectionName}
                  </span>
                )}

                {/* PR badge */}
                {ticket.github_pr_number && ticket.github_pr_url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.systemOps.openInChrome(ticket.github_pr_url!)
                    }}
                    title={`Open PR #${ticket.github_pr_number} in browser`}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
                  >
                    <GitPullRequest className="h-3 w-3" />
                    #{ticket.github_pr_number}
                  </button>
                )}

                {/* Creating PR indicator */}
                {isCreatingPR && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Creating PR...
                  </span>
                )}

                {/* Run process alive indicator */}
                {isRunProcessAlive && (
                  <PulseAnimation className="h-3 w-3 text-green-500 shrink-0" />
                )}

                {/* Plan ready badge */}
                {ticket.plan_ready && (
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[11px] font-medium text-violet-500">
                    Plan ready
                  </span>
                )}

                {/* Error badge */}
                {isError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[11px] font-medium text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    Error
                  </span>
                )}

                {(isBusy || isAsking) && ticket.mode && (
                  <span data-testid="kanban-ticket-progress" className="ml-auto flex items-center gap-1.5">
                    {timerText && (
                      <span className={cn(
                        'text-[11px] tabular-nums font-semibold',
                        isAsking
                          ? 'text-amber-500'
                          : ticket.mode === 'build'
                            ? 'text-blue-500'
                            : 'text-violet-500'
                      )}>
                        {timerText}
                      </span>
                    )}
                    <IndeterminateProgressBar mode={ticket.mode} isAsking={isAsking} className="w-20" />
                    {isAsking && (
                      <span className="text-[11px] font-semibold text-amber-500">
                        Question
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
              </div>
            </PopoverAnchor>
          </ContextMenuTrigger>

          <ContextMenuContent>
          {/* Todo tickets without worktree: pre-assign */}
          {isSimpleTicket && isTodo && !ticket.worktree_id && (
            <ContextMenuItem
              data-testid="ctx-assign-worktree"
              onClick={() => setShowPreAssignPicker(true)}
              className="gap-2"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Assign worktree
            </ContextMenuItem>
          )}

          {/* Todo tickets WITH pre-assigned worktree: change or unassign */}
          {isSimpleTicket && isTodo && ticket.worktree_id && (
            <>
              <ContextMenuItem
                data-testid="ctx-change-worktree"
                onClick={() => setShowPreAssignPicker(true)}
                className="gap-2"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Change worktree
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-unassign-worktree"
                onClick={handleUnassignWorktree}
                className="gap-2"
              >
                <X className="h-3.5 w-3.5" />
                Unassign worktree
              </ContextMenuItem>
            </>
          )}

          {/* Non-todo simple tickets: full assign flow (existing behavior) */}
          {isSimpleTicket && !isTodo && (
            <ContextMenuItem
              data-testid="ctx-assign-worktree"
              onClick={() => setShowWorktreePicker(true)}
              className="gap-2"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Assign to worktree
            </ContextMenuItem>
          )}

          {/* Jump to session — only for flow tickets with reachable session */}
          {isFlowTicket && !(connectionSession && !connectionName) && (
            <ContextMenuItem
              data-testid="ctx-jump-to-session"
              onClick={handleJumpToSession}
              className="gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Jump to session
            </ContextMenuItem>
          )}

          {/* Worktree actions: edit context & pin/unpin (when worktree assigned) */}
          {ticket.worktree_id && (
            <>
              <ContextMenuItem
                data-testid="ctx-edit-context"
                onClick={handleEditContext}
                className="gap-2"
              >
                <FileText className="h-3.5 w-3.5" />
                Edit Context
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-toggle-pin"
                onClick={handleTogglePin}
                className="gap-2"
              >
                {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {isPinned ? 'Unpin worktree' : 'Pin worktree'}
              </ContextMenuItem>
            </>
          )}

          {/* Update status on remote platform */}
          {isExternalTicket && (
            <ContextMenuItem
              data-testid="ctx-update-remote-status"
              onClick={() => setShowStatusUpdate(true)}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Update on {getProviderLabel(ticket.external_provider!)}
            </ContextMenuItem>
          )}

          {/* Attach PR */}
          {hasGitRemote && (
            <ContextMenuItem
              data-testid="ctx-attach-pr"
              onClick={() => setShowPRPicker(true)}
              className="gap-2"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              Attach PR
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger data-testid="ctx-mark-submenu" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Mark
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup value={ticket.mark ?? 'none'} onValueChange={handleMarkChange}>
                <ContextMenuRadioItem value="none">No Mark</ContextMenuRadioItem>
                <ContextMenuRadioItem value="common">
                  <span className="h-2 w-2 rounded-full bg-green-500 inline-block mr-2" />
                  Common
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="rare">
                  <span className="h-2 w-2 rounded-full bg-blue-500 inline-block mr-2" />
                  Rare
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="epic">
                  <span className="h-2 w-2 rounded-full bg-purple-500 inline-block mr-2" />
                  Epic
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value="legendary">
                  <span className="h-2 w-2 rounded-full bg-orange-500 inline-block mr-2" />
                  Legendary
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          {/* Archive/Unarchive (done tickets) or Delete (all others) */}
          {isDone ? (
            isArchived ? (
              <ContextMenuItem
                data-testid="ctx-unarchive-ticket"
                onClick={handleUnarchive}
                className="gap-2"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Unarchive
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                data-testid="ctx-archive-ticket"
                onClick={handleArchive}
                className="gap-2"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </ContextMenuItem>
            )
          ) : (
            <ContextMenuItem
              data-testid="ctx-delete-ticket"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2 text-red-500 focus:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </ContextMenuItem>
          )}
          </ContextMenuContent>
        </ContextMenu>
        <AttachPRPopover ticket={ticket} open={showPRPicker} onOpenChange={setShowPRPicker} />
      </Popover>

      {/* Delete confirmation dialog (not used for done/archive tickets) */}
      {!isDone && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent data-testid="ctx-delete-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete ticket</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{ticket.title}&rdquo;? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="ctx-delete-cancel-btn">Cancel</AlertDialogCancel>
              <AlertDialogAction
                data-testid="ctx-delete-confirm-btn"
                variant="destructive"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Worktree picker modal for full assign (non-todo) */}
      <WorktreePickerModal
        ticket={ticket}
        projectId={ticket.project_id}
        open={showWorktreePicker}
        onOpenChange={setShowWorktreePicker}
      />

      {/* Pre-assign worktree picker (todo column) */}
      <WorktreePickerModal
        ticket={ticket}
        projectId={ticket.project_id}
        open={showPreAssignPicker}
        onOpenChange={setShowPreAssignPicker}
        preAssignOnly
      />

      {isExternalTicket && ticket.external_id && ticket.external_url && (
        <UpdateStatusModal
          open={showStatusUpdate}
          onOpenChange={setShowStatusUpdate}
          externalProvider={ticket.external_provider!}
          externalId={ticket.external_id}
          externalUrl={ticket.external_url}
          ticketTitle={ticket.title}
        />
      )}
    </>
  )
})
