import { useQuery } from '@tanstack/react-query';
import type { Invoice } from '@verifiq/domain';
import { fetchInvoice } from './api';

/**
 * Polls the invoice while its record waits in the outbox, until the connector answers and its PDF is
 * drawn; then, less often, until the AEAT's verdict arrives.
 */
export function useInvoice(invoiceId: string | undefined, initial?: Invoice) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId!),
    enabled: invoiceId !== undefined,
    initialData: initial,
    retry: false,
    refetchInterval: ({ state: { data } }) => {
      if (data?.record.status === 'pending-submission' || (data?.record.verificationUrl && !data.pdf)) return 1000;
      return data?.record.status === 'submitted' ? 10_000 : false;
    },
  });
}
