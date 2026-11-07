import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { useAtlas } from "./store";

// development only: `atlas.getState().select("div_…")` in the console opens a card, and the rest of the store is
// there to read
if (import.meta.env.DEV) (window as unknown as { atlas: typeof useAtlas }).atlas = useAtlas;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
