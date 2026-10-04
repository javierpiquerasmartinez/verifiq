import { useQuery } from '@tanstack/react-query';
import type { Invoice } from '@verifiq/domain';
import { fetchInvoice } from './api';

/** Polls the invoice while its record waits in the outbox, until the connector answers. */
export function useInvoice(invoiceId: string | undefined, initial?: Invoice) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId!),
    enabled: invoiceId !== undefined,
    initialData: initial,
    retry: false,
    refetchInterval: (query) => (query.state.data?.record.status === 'pending-submission' ? 1000 : false),
  });
}
