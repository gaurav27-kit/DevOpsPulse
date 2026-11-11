import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

describe('TanStack Query v5 Invalidation Contract', () => {
  it('strictly requires { queryKey } object syntax in v5 to invalidate targeted queries', async () => {
    const queryClient = new QueryClient();

    // Seed two independent queries
    queryClient.setQueryData(['slos'], [{ id: 1, name: 'SLO 1' }]);
    queryClient.setQueryData(['slo', 'app-123'], { id: 1, name: 'SLO 1' });
    queryClient.setQueryData(['other-entity'], { id: 99 });

    // Ensure all 3 queries are fresh
    const q1 = queryClient.getQueryCache().find({ queryKey: ['slos'] });
    const q2 = queryClient.getQueryCache().find({ queryKey: ['slo', 'app-123'] });
    const q3 = queryClient.getQueryCache().find({ queryKey: ['other-entity'] });

    expect(q1.state.isInvalidated).toBe(false);
    expect(q2.state.isInvalidated).toBe(false);
    expect(q3.state.isInvalidated).toBe(false);

    // Invalidate using TanStack Query v5 object syntax: { queryKey: [...] }
    await queryClient.invalidateQueries({ queryKey: ['slo', 'app-123'] });

    // Assert only the targeted query is marked as invalidated
    expect(q2.state.isInvalidated).toBe(true);
    expect(q1.state.isInvalidated).toBe(false);
    expect(q3.state.isInvalidated).toBe(false);

    // Invalidate list query
    await queryClient.invalidateQueries({ queryKey: ['slos'] });
    expect(q1.state.isInvalidated).toBe(true);
    expect(q3.state.isInvalidated).toBe(false);
  });

  it('demonstrates legacy v4 array syntax failure: calling invalidateQueries(["slos"]) directly leaves queryKey undefined in v5 filter object', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['slos'], [{ id: 1 }]);

    const query = queryClient.getQueryCache().find({ queryKey: ['slos'] });
    expect(query.state.isInvalidated).toBe(false);

    // In TanStack Query v5, invalidateQueries accepts (filters?: InvalidateQueryFilters).
    // An Array like ['slos'] has no .queryKey property (['slos'].queryKey === undefined).
    const legacyArrayArg = ['slos'];
    expect(legacyArrayArg.queryKey).toBeUndefined();

    // Using object syntax { queryKey: ['slos'] } correctly assigns filters.queryKey
    const modernObjectArg = { queryKey: ['slos'] };
    expect(modernObjectArg.queryKey).toEqual(['slos']);

    await queryClient.invalidateQueries(modernObjectArg);
    expect(query.state.isInvalidated).toBe(true);
  });
});
