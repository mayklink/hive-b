import type { KanbanTicketColumn } from '../../../main/db/types'
import type { FollowUpTriggerColumn } from '@/stores/useSettingsStore'

export function isBlockerSatisfied(
  blockerColumn: KanbanTicketColumn,
  triggerColumn: FollowUpTriggerColumn
): boolean {
  if (triggerColumn === 'review') {
    return blockerColumn === 'review' || blockerColumn === 'done'
  }
  return blockerColumn === 'done'
}
