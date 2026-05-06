import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ERPProvider } from "./context/ERPContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <ERPProvider>
          <App />
        </ERPProvider>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
);
