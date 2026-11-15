import { useState } from 'react';
import { usePageTitle } from '../context/PageTitleContext';
import ActiveUsersCard from '../components/ActiveUsersCard';
import RealtimeConnectionLog from '../components/RealtimeConnectionLog';
import GlobalXrayLog from '../components/GlobalXrayLog';

export default function Connections() {
  usePageTitle('Connections & Logs');
  const [selectedIp, setSelectedIp] = useState(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <ActiveUsersCard selectedIp={selectedIp} onSelectIp={setSelectedIp} />
        </div>
        <div className="lg:col-span-7">
          <RealtimeConnectionLog
            selectedIp={selectedIp}
            onClearIpFilter={() => setSelectedIp(null)}
          />
        </div>
      </div>

      <div>
        <GlobalXrayLog />
      </div>
    </div>
  );
}
