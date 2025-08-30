import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";

export default defineBackend({
  auth,
});
