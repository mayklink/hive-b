import { useEffect, useState } from 'react'
import { LayoutGroup, motion } from 'motion/react'
import { Download } from 'lucide-react'
import { useKanbanStore } from '@/stores/useKanbanStore'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'
import { KanbanTicketModal } from '@/components/kanban/KanbanTicketModal'
import { ImportTicketsModal } from '@/components/kanban/ImportTicketsModal'
import { Button } from '@/components/ui/button'
import type { KanbanTicketColumn } from '../../../../main/db/types'

const COLUMNS: KanbanTicketColumn[] = ['todo', 'in_progress', 'review', 'done']

interface KanbanBoardProps {
  projectId: string
  projectPath: string
}

export function KanbanBoard({ projectId, projectPath }: KanbanBoardProps) {
  const loadTickets = useKanbanStore((state) => state.loadTickets)
  const getTicketsByColumn = useKanbanStore((state) => state.getTicketsByColumn)
  const getArchivedTicketsByColumn = useKanbanStore((state) => state.getArchivedTicketsByColumn)
  const [showImport, setShowImport] = useState(false)

  useKanbanStore((state) => state.tickets)

  useEffect(() => {
    loadTickets(projectId)
  }, [projectId, loadTickets])

  return (
    <LayoutGroup>
      <div className="flex flex-1 flex-col min-h-0">
        {/* Board header */}
        <div className="flex items-center justify-end px-4 pt-3 pb-0 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowImport(true)}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Import
          </Button>
        </div>

        {/* Columns */}
        <motion.div
          layoutScroll
          data-testid="kanban-board"
          className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-4"
        >
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              column={column}
              tickets={getTicketsByColumn(projectId, column)}
              archivedTickets={column === 'done' ? getArchivedTicketsByColumn(projectId, 'done') : undefined}
              projectId={projectId}
            />
          ))}
          <KanbanTicketModal />
        </motion.div>
      </div>

      <ImportTicketsModal
        open={showImport}
        onOpenChange={setShowImport}
        projectId={projectId}
        projectPath={projectPath}
      />
    </LayoutGroup>
  )
}
