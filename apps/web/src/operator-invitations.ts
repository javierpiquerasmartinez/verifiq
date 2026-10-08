import {
  INVITATION_LIST_FILTERS,
  INVITATION_LIST_SORTS,
  SORT_ORDERS,
  type InvitationListSort,
  type SortOrder,
} from '@verifiq/domain';
import { z } from 'zod';

/**
 * The view of the invitations page, kept in its URL so it can be reloaded or shared. Whatever the URL
 * leaves out or does not understand falls back to its default, so a link needs none of it.
 */
export const invitationsSearchSchema = z.object({
  q: z.string().default('').catch(''),
  status: z.enum(INVITATION_LIST_FILTERS).default('all').catch('all'),
  sort: z.enum(INVITATION_LIST_SORTS).default('sent').catch('sent'),
  order: z.enum(SORT_ORDERS).default('desc').catch('desc'),
});

export type InvitationsSearch = z.infer<typeof invitationsSearchSchema>;

/** The view the URL asks for. */
export const invitationsSearch = (search: Record<string, unknown>): InvitationsSearch => invitationsSearchSchema.parse(search);

/** Dates are read latest first, and emails from A. */
const FIRST_ORDER: Record<InvitationListSort, SortOrder> = { sent: 'desc', expires: 'desc', email: 'asc' };

/** The sort after a click on `column`'s header: the other way round if it is sorted by it already. */
export function nextSort(
  current: { sort: InvitationListSort; order: SortOrder },
  column: InvitationListSort,
): { sort: InvitationListSort; order: SortOrder } {
  if (current.sort !== column) return { sort: column, order: FIRST_ORDER[column] };
  return { sort: column, order: current.order === 'asc' ? 'desc' : 'asc' };
}
