import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@/src/styles/globals.css";
import { AuthProvider } from "./app/auth-context";
import { createReadmatesRouter } from "./app/router";

const router = createReadmatesRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
