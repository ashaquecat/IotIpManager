import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { IPPoolManager } from './components/IPPoolManager';
import { IPStatusViewer } from './components/IPStatusViewer';
import { AccountManager } from './components/AccountManager';
import { OrganizationUnitManager } from './components/OrganizationUnitManager';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [activeTab, setActiveTab] = useState('ippools');

  // Mock user for demo mode
  const demoUser = {
    displayName: '演示用户',
    email: 'demo@example.com',
    photoURL: null,
    uid: 'demo-user-id'
  } as any;

  return (
    <ErrorBoundary>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={demoUser}>
        {activeTab === 'ippools' && <IPPoolManager />}
        {activeTab === 'ipstatus' && <IPStatusViewer />}
        {activeTab === 'accounts' && <AccountManager />}
        {activeTab === 'ou' && <OrganizationUnitManager />}
      </Layout>
    </ErrorBoundary>
  );
}
