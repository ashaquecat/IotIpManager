import React, { ReactNode } from 'react';
import { LayoutDashboard, Database, Users, Building2, LogOut, User as UserIcon } from 'lucide-react';
import { auth } from '../firebase';
import { User } from 'firebase/auth';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User;
}

export function Layout({ children, activeTab, setActiveTab, user }: LayoutProps) {
  const menuItems = [
    { id: 'ippools', label: 'IP 池配置', icon: Database },
    { id: 'ipstatus', label: '地址池状态', icon: LayoutDashboard },
    { id: 'accounts', label: '终端账号管理', icon: Users },
    { id: 'ou', label: '组织机构管理', icon: Building2 },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
            <Database className="w-6 h-6" />
            IoT IP 管理系统
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.displayName || '用户'}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
