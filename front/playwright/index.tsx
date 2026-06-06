import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@/src/styles/globals.css";

beforeMount(async () => {
  document.documentElement.lang = "ko";
});
