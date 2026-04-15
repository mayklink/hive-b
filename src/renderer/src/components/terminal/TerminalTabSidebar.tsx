import { useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useTerminalTabStore } from '@/stores/useTerminalTabStore'
import { useShallow } from 'zustand/react/shallow'
import { TerminalTabEntry } from './TerminalTabEntry'

interface TerminalTabSidebarProps {
  worktreeId: string
}

export function TerminalTabSidebar({ worktreeId }: TerminalTabSidebarProps): React.JSX.Element {
  const { tabs, activeTabId } = useTerminalTabStore(
    useShallow((s) => ({
      tabs: s.tabsByWorktree.get(worktreeId) ?? [],
      activeTabId: s.activeTabByWorktree.get(worktreeId)
    }))
  )

  const { createTab, setActiveTab, closeTab, renameTab, closeOtherTabs } = useTerminalTabStore(
    useShallow((s) => ({
      createTab: s.createTab,
      setActiveTab: s.setActiveTab,
      closeTab: s.closeTab,
      renameTab: s.renameTab,
      closeOtherTabs: s.closeOtherTabs
    }))
  )

  const handleCreateTab = useCallback(() => {
    createTab(worktreeId)
  }, [createTab, worktreeId])

  return (
    <div className="w-[140px] border-l border-border flex flex-col h-full bg-background/50">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground font-medium select-none">Terminals</span>
        <button
          onClick={handleCreateTab}
          className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="New Terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Scrollable tab list */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {tabs.map((tab) => (
          <TerminalTabEntry
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => setActiveTab(worktreeId, tab.id)}
            onClose={() => closeTab(worktreeId, tab.id)}
            onRename={(name) => renameTab(worktreeId, tab.id, name)}
            onCloseOthers={() => closeOtherTabs(worktreeId, tab.id)}
          />
        ))}
      </div>
    </div>
  )
}
