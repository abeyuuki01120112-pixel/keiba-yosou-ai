import { useState } from "react";
import "./App.css";
import { PredictionDashboard } from "./components/PredictionDashboard";
import { SimulatorView } from "./components/SimulatorView";

type Tab = "dashboard" | "simulator";

function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div>
      <nav className="top-tabs">
        <button
          type="button"
          className={tab === "dashboard" ? "top-tab top-tab-active" : "top-tab"}
          onClick={() => setTab("dashboard")}
        >
          予想ダッシュボード
        </button>
        <button
          type="button"
          className={tab === "simulator" ? "top-tab top-tab-active" : "top-tab"}
          onClick={() => setTab("simulator")}
        >
          V0シミュレーター
        </button>
      </nav>
      {tab === "dashboard" ? <PredictionDashboard /> : <SimulatorView />}
    </div>
  );
}

export default App;
