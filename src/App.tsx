import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { IPPoolManager } from './components/IPPoolManager';
import { IPStatusViewer } from './components/IPStatusViewer';
import { AccountManager } from './components/AccountManager';
import { OrganizationUnitManager } from './components/OrganizationUnitManager';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [activeTab, setActiveTab] = useState('ippools');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  // Mock user for demo mode
  const demoUser = {
    displayName: '演示用户',
    email: 'demo@example.com',
    photoURL: null,
    uid: 'demo-user-id'
  } as any;

  const handleViewPoolStatus = (poolId: string) => {
    setSelectedPoolId(poolId);
    setActiveTab('ipstatus');
  };

  return (
    <ErrorBoundary>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={demoUser}>
        {activeTab === 'ippools' && (
          <IPPoolManager onViewStatus={handleViewPoolStatus} />
        )}
        {activeTab === 'ipstatus' && (
          <IPStatusViewer initialPoolId={selectedPoolId} />
        )}
        {activeTab === 'accounts' && <AccountManager />}
        {activeTab === 'ou' && <OrganizationUnitManager />}
      </Layout>
    </ErrorBoundary>
  );
}
