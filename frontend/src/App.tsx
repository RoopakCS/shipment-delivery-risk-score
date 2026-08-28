import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

// Placeholder Pages
import { RiskQueue } from './pages/RiskQueue';

const ShipmentDetail = () => <div>Shipment Detail Screen</div>;
const Backtest = () => <div>Backtest Screen</div>;
const ModelTrust = () => <div>Model Trust Screen</div>;
const Community = () => <div>Community Concept Screen</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<RiskQueue />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="backtest" element={<Backtest />} />
          <Route path="model" element={<ModelTrust />} />
          <Route path="community" element={<Community />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
