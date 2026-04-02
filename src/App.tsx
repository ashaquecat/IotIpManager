import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth } from './firebase';
import { Layout } from './components/Layout';
import { IPPoolManager } from './components/IPPoolManager';
import { IPStatusViewer } from './components/IPStatusViewer';
import { AccountManager } from './components/AccountManager';
import { OrganizationUnitManager } from './components/OrganizationUnitManager';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ippools');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">物联网终端 IP 池管理系统</h1>
          <p className="text-gray-600 mb-8">请使用您的 Google 账号登录以访问系统。</p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            使用 Google 账号登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
        {activeTab === 'ippools' && <IPPoolManager />}
        {activeTab === 'ipstatus' && <IPStatusViewer />}
        {activeTab === 'accounts' && <AccountManager />}
        {activeTab === 'ou' && <OrganizationUnitManager />}
      </Layout>
    </ErrorBoundary>
  );
}
