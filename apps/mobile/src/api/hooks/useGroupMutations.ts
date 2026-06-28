import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { z } from 'zod';

const DeleteGroupResponse = z.object({
  deletedGroups: z.number().int().nonnegative(),
  deletedSeries: z.number().int().nonnegative(),
});

function invalidateGroupKeys(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['library-groups'] });
  qc.invalidateQueries({ queryKey: ['library'] });
  qc.invalidateQueries({ queryKey: ['series'] });
}

/**
 * Create / rename / delete library groups.
 *
 * createGroup:   POST /api/library/groups  — parentId omitted at root (null rejected).
 * renameGroup:   PATCH /api/library/groups/{id}
 * deleteGroup:   DELETE /api/library/groups/{id} → {deletedGroups, deletedSeries}
 *
 * On 409/422 the thrown ApiError.body carries {message} or {error} for inline display.
 */
export function useGroupMutations() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();

  function makeClient() {
    if (state.status !== 'authenticated') throw new Error('unauthenticated');
    return createApiClient(state.creds, { onAuthFail: () => signOut() });
  }

  const createGroup = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: number | null }) => {
      const client = makeClient();
      const body = { name, ...(parentId != null && { parentId }) };
      return client.post('/api/library/groups', body);
    },
    onSuccess: () => invalidateGroupKeys(qc),
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const client = makeClient();
      return client.patch(`/api/library/groups/${id}`, { name });
    },
    onSuccess: () => invalidateGroupKeys(qc),
  });

  const deleteGroup = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const client = makeClient();
      const raw = await client.delete(`/api/library/groups/${id}`);
      return DeleteGroupResponse.parse(raw);
    },
    onSuccess: () => invalidateGroupKeys(qc),
  });

  return { createGroup, renameGroup, deleteGroup };
}
