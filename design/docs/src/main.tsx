import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@readmates/design-system/styles.css";
import "./app.css";
import { App } from "./app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("ReadMates design docs root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
