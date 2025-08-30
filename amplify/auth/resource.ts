import { defineFunction } from "@aws-amplify/backend";

export const auth = defineFunction({
  name: "auth",
  entry: "./handler.ts",
  // （必要なら）timeoutSeconds: 10, memoryMB: 256 など指定可
});
