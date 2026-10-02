import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ApiError } from './api';

/** Back to sign-in when the session expired (inactivity or 7-day limit) while the page was open. */
export function useSessionExpiry(error: unknown): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      void navigate({ to: '/sign-in', search: { reason: 'expired' } });
    }
  }, [error, navigate]);
}
