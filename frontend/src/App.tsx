import { useEffect, useState } from 'react';
import { getHealth } from './api';
import { Activity } from 'lucide-react';

function App() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen p-8 bg-gray-50 flex flex-col items-center">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 justify-center">
          <Activity className="text-blue-600" />
          Shipment Delivery Risk Score
        </h1>
        <p className="text-gray-500 mt-2">Hackathon Prototype</p>
      </header>

      <main className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">API Health Status</h2>
        
        {error ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-md">
            Failed to connect to backend: {error}
          </div>
        ) : !health ? (
          <div className="text-gray-500 animate-pulse">Checking health...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded border">
                <div className="text-sm text-gray-500">Status</div>
                <div className="font-medium text-green-600">{health.status}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <div className="text-sm text-gray-500">Models Loaded</div>
                <div className="font-medium">{health.models_loaded ? 'Yes' : 'No'}</div>
              </div>
            </div>
            
            <h3 className="font-medium mt-4">Signal Providers:</h3>
            <div className="space-y-2">
              {health.providers?.map((p: any) => (
                <div key={p.name} className="flex justify-between items-center p-2 border rounded">
                  <span className="capitalize">{p.name}</span>
                  <span className={`text-sm px-2 py-1 rounded-full ${p.is_live ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {p.is_live ? 'Live' : 'Degraded (Fallback)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
