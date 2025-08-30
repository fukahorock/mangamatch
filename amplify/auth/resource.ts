import { defineFunction } from "@aws-amplify/backend";

export const auth = defineFunction({
  name: "auth",
  entry: "./handler.ts",
  // runtime: 20, // ←問題が続く場合は有効化（Node.js 20）
});
