import { defineFunction } from '@aws-amplify/backend';

export const auth = defineFunction({
  name: 'auth',
  entry: './handler.ts',
  // runtime: 20, // うまくいかない時はコメント解除（Node.js 20）
});
