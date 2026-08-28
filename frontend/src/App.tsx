import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RiskQueue from "./pages/RiskQueue";
import ShipmentDetail from "./pages/ShipmentDetail";
import Predict from "./pages/Predict";
import Backtest from "./pages/Backtest";
import ModelTrust from "./pages/ModelTrust";
import Community from "./pages/Community";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RiskQueue />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="predict" element={<Predict />} />
          <Route path="backtest" element={<Backtest />} />
          <Route path="model" element={<ModelTrust />} />
          <Route path="community" element={<Community />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
