import { describe, expect, it } from 'vitest';
import { nextSort, readInvitationsSearch } from './operator-invitations';

describe('readInvitationsSearch', () => {
  it('shows every invitation, the most recently sent first, by default', () => {
    expect(readInvitationsSearch({})).toEqual({ q: '', status: 'all', sort: 'sent', order: 'desc' });
  });

  it('reads the search, filter and sort of the URL', () => {
    expect(readInvitationsSearch({ q: 'lucia', status: 'revoked', sort: 'email', order: 'asc' })).toEqual({
      q: 'lucia',
      status: 'revoked',
      sort: 'email',
      order: 'asc',
    });
  });

  it('reads a search of digits, which the URL hands over as a number', () => {
    expect(readInvitationsSearch({ q: 2026 }).q).toBe('2026');
  });

  it('drops a search longer than the list accepts', () => {
    expect(readInvitationsSearch({ q: 'a'.repeat(201) }).q).toBe('');
  });

  it('falls back to the default of whatever it does not understand, keeping the rest', () => {
    expect(readInvitationsSearch({ q: { name: 'x' }, status: 'gone', sort: 'email', order: 'sideways' })).toEqual({
      q: '',
      status: 'all',
      sort: 'email',
      order: 'desc',
    });
  });
});

describe('nextSort', () => {
  it('flips the order of the column it is sorted by', () => {
    expect(nextSort({ sort: 'sent', order: 'desc' }, 'sent')).toEqual({ sort: 'sent', order: 'asc' });
    expect(nextSort({ sort: 'email', order: 'asc' }, 'email')).toEqual({ sort: 'email', order: 'desc' });
  });

  it('sorts a new column dates latest first and emails from A', () => {
    expect(nextSort({ sort: 'sent', order: 'desc' }, 'expires')).toEqual({ sort: 'expires', order: 'desc' });
    expect(nextSort({ sort: 'sent', order: 'asc' }, 'email')).toEqual({ sort: 'email', order: 'asc' });
  });
});
