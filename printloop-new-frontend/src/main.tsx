import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { store } from "@/store";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1A1410",
              color: "#F8F4ED",
              border: "2px solid #1A1410",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.04em",
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
