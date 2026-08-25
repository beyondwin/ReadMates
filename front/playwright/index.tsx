import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@/src/styles/globals.css";
import "@/features/host/route/host-meeting-workspace.css";

beforeMount(async () => {
  document.documentElement.lang = "ko";
});
