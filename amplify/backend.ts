import { defineBackend } from '@aws-amplify/backend';
import { auth as authFn } from './functions/auth/resource';

export const backend = defineBackend({
  auth: authFn, // リソース名は "auth" のまま
});
