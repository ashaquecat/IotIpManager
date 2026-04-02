import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, getDoc, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { TerminalAccount, IPPool, OrganizationUnit, IPAddress } from '../types';
import { generatePassword } from '../utils/ipUtils';
import { Plus, Trash2, Edit2, Search, RefreshCw, Download, UserPlus, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from './Modal';

export function AccountManager() {
  const [accounts, setAccounts] = useState<TerminalAccount[]>([]);
  const [pools, setPools] = useState<IPPool[]>([]);
  const [ous, setOus] = useState<OrganizationUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isAutoAdding, setIsAutoAdding] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOu, setSearchOu] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'confirm' as 'confirm' | 'alert' | 'error', onConfirm: () => {} });

  const [formData, setFormData] = useState<Partial<TerminalAccount & { selectedPoolId: string }>>({
    accountName: '',
    ip: '',
    mac: '',
    ouId: '',
    applicant: '',
    safetyOfficer: '',
    remarks: '',
    password: '',
    selectedPoolId: ''
  });

  const [autoFormData, setAutoFormData] = useState({
    count: 1,
    ouId: '',
    applicant: '',
    safetyOfficer: '',
    remarks: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const accountsSnapshot = await getDocs(collection(db, 'terminalAccounts'));
      const fetchedAccounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TerminalAccount));
      setAccounts(fetchedAccounts);

      const poolsSnapshot = await getDocs(collection(db, 'ipPools'));
      const fetchedPools = poolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPPool));
      setPools(fetchedPools);

      const ousSnapshot = await getDocs(collection(db, 'organizationUnits'));
      const fetchedOus = ousSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationUnit));
      setOus(fetchedOus);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'terminalAccounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchAvailableIp = async (ouId: string, poolId?: string) => {
    if (!ouId) return;
    try {
      let q = query(
        collection(db, 'ipAddresses'),
        where('ouId', '==', ouId),
        where('status', '==', 'unused'),
        orderBy('ip'),
        limit(1)
      );

      if (poolId) {
        q = query(
          collection(db, 'ipAddresses'),
          where('poolId', '==', poolId),
          where('status', '==', 'unused'),
          orderBy('ip'),
          limit(1)
        );
      }

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const ipData = snapshot.docs[0].data() as IPAddress;
        setFormData(prev => ({
          ...prev,
          ip: ipData.ip,
          accountName: `yzd_${ipData.ip.replace(/\./g, '_')}`,
          selectedPoolId: poolId || ipData.poolId
        }));
      } else {
        setFormData(prev => ({ ...prev, ip: '', accountName: '' }));
        setModalConfig({
          title: '无可用 IP',
          message: poolId ? '所选地址池下没有可用的 IP 地址。' : '所选组织机构下没有可用的 IP 地址。',
          type: 'alert',
          onConfirm: () => {}
        });
        setModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching available IP:', error);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      let ipQuery = query(
        collection(db, 'ipAddresses'),
        where('ip', '==', formData.ip),
        where('ouId', '==', formData.ouId),
        where('status', '==', 'unused')
      );

      if (formData.selectedPoolId) {
        ipQuery = query(
          collection(db, 'ipAddresses'),
          where('ip', '==', formData.ip),
          where('poolId', '==', formData.selectedPoolId),
          where('status', '==', 'unused')
        );
      }

      const ipSnapshot = await getDocs(ipQuery);
      if (ipSnapshot.empty) {
        setModalConfig({
          title: '无效 IP',
          message: 'IP 地址无效或已被占用，请检查所选组织机构的地址池。',
          type: 'alert',
          onConfirm: () => {}
        });
        setModalOpen(true);
        setProcessing(false);
        return;
      }

      const ipDoc = ipSnapshot.docs[0];
      const password = generatePassword();
      const accountData = {
        ...formData,
        password,
        accountName: `yzd_${formData.ip?.replace(/\./g, '_')}`
      } as TerminalAccount;

      const batch = writeBatch(db);
      const accountRef = doc(collection(db, 'terminalAccounts'));
      batch.set(accountRef, accountData);
      batch.update(ipDoc.ref, { status: 'used', accountId: accountRef.id });

      const poolId = (ipDoc.data() as IPAddress).poolId;
      const poolRef = doc(db, 'ipPools', poolId);
      const poolDoc = await getDoc(poolRef);
      if (poolDoc.exists()) {
        batch.update(poolRef, { usedCount: (poolDoc.data() as IPPool).usedCount + 1 });
      }

      await batch.commit();
      setIsAdding(false);
      setFormData({ accountName: '', ip: '', mac: '', ouId: '', applicant: '', safetyOfficer: '', remarks: '', password: '', selectedPoolId: '' });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'terminalAccounts');
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const q = query(
        collection(db, 'ipAddresses'),
        where('ouId', '==', autoFormData.ouId),
        where('status', '==', 'unused'),
        orderBy('ip'),
        limit(autoFormData.count)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.size < autoFormData.count) {
        setModalConfig({
          title: 'IP 不足',
          message: `该组织机构下仅剩 ${snapshot.size} 个可用 IP。`,
          type: 'alert',
          onConfirm: () => {}
        });
        setModalOpen(true);
        setProcessing(false);
        return;
      }

      const batch = writeBatch(db);
      const newAccounts: any[] = [];

      for (const ipDoc of snapshot.docs) {
        const ipData = ipDoc.data() as IPAddress;
        const password = generatePassword();
        const accountData = {
          accountName: `yzd_${ipData.ip.replace(/\./g, '_')}`,
          ip: ipData.ip,
          ouId: autoFormData.ouId,
          applicant: autoFormData.applicant,
          safetyOfficer: autoFormData.safetyOfficer,
          remarks: autoFormData.remarks,
          password
        };

        const accountRef = doc(collection(db, 'terminalAccounts'));
        batch.set(accountRef, accountData);
        batch.update(ipDoc.ref, { status: 'used', accountId: accountRef.id });
        newAccounts.push(accountData);
      }

      const poolIds = Array.from(new Set(snapshot.docs.map(d => (d.data() as IPAddress).poolId)));
      for (const pid of poolIds) {
        const poolRef = doc(db, 'ipPools', pid);
        const poolDoc = await getDoc(poolRef);
        if (poolDoc.exists()) {
          const countInThisPool = snapshot.docs.filter(d => (d.data() as IPAddress).poolId === pid).length;
          batch.update(poolRef, { usedCount: (poolDoc.data() as IPPool).usedCount + countInThisPool });
        }
      }

      await batch.commit();
      
      const ws = XLSX.utils.json_to_sheet(newAccounts);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '批量开户结果');
      XLSX.writeFile(wb, `batch_accounts_${new Date().getTime()}.xlsx`);

      setIsAutoAdding(false);
      setAutoFormData({ count: 1, ouId: '', applicant: '', safetyOfficer: '', remarks: '' });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'terminalAccounts');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteAccount = async (account: TerminalAccount) => {
    setModalConfig({
      title: '确认销户',
      message: `您确定要注销账号 ${account.accountName} 吗？注销后 IP 将被释放。`,
      type: 'confirm',
      onConfirm: async () => {
        setProcessing(true);
        try {
          const batch = writeBatch(db);
          const ipQuery = query(collection(db, 'ipAddresses'), where('ip', '==', account.ip));
          const ipSnapshot = await getDocs(ipQuery);
          
          if (!ipSnapshot.empty) {
            const ipDoc = ipSnapshot.docs[0];
            batch.update(ipDoc.ref, { status: 'unused', accountId: null });
            
            const poolId = (ipDoc.data() as IPAddress).poolId;
            const poolRef = doc(db, 'ipPools', poolId);
            const poolDoc = await getDoc(poolRef);
            if (poolDoc.exists()) {
              batch.update(poolRef, { usedCount: Math.max(0, (poolDoc.data() as IPPool).usedCount - 1) });
            }
          }

          batch.delete(doc(db, 'terminalAccounts', account.id!));
          await batch.commit();
          fetchData();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `terminalAccounts/${account.id}`);
        } finally {
          setProcessing(false);
        }
      }
    });
    setModalOpen(true);
  };

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.accountName.includes(searchQuery) || acc.ip.includes(searchQuery);
    const matchesOu = searchOu === '' || acc.ouId === searchOu;
    return matchesSearch && matchesOu;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">终端账号管理</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setIsAutoAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            自动批量开户
          </button>
          <button
            onClick={() => {
              setFormData({ accountName: '', ip: '', mac: '', ouId: '', applicant: '', safetyOfficer: '', remarks: '', password: '', selectedPoolId: '' });
              setIsAdding(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            手动开户
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">搜索账号/IP</label>
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="搜索..."
            />
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">组织机构</label>
          <select
            value={searchOu}
            onChange={(e) => setSearchOu(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">所有机构</option>
            {ous.map(ou => (
              <option key={ou.id} value={ou.id}>{ou.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleCreateAccount} className="bg-white p-6 rounded-xl shadow-md border border-blue-100 space-y-6 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <UserPlus className="w-5 h-5" />
            <h3 className="font-semibold">手动开户</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">组织机构</label>
              <select
                required
                value={formData.ouId}
                onChange={(e) => {
                  const newOuId = e.target.value;
                  setFormData({ ...formData, ouId: newOuId, ip: '', selectedPoolId: '' });
                  if (newOuId) {
                    const ouPools = pools.filter(p => p.ouId === newOuId);
                    if (ouPools.length === 1) {
                      fetchAvailableIp(newOuId, ouPools[0].id);
                    } else if (ouPools.length > 1) {
                      // Let user select pool
                    } else {
                      fetchAvailableIp(newOuId);
                    }
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">选择 OU</option>
                {ous.map(ou => (
                  <option key={ou.id} value={ou.id}>{ou.name}</option>
                ))}
              </select>
            </div>
            {formData.ouId && pools.filter(p => p.ouId === formData.ouId).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择地址池</label>
                <select
                  required
                  value={formData.selectedPoolId}
                  onChange={(e) => {
                    const newPoolId = e.target.value;
                    setFormData({ ...formData, selectedPoolId: newPoolId, ip: '' });
                    fetchAvailableIp(formData.ouId!, newPoolId);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="">选择地址池</option>
                  {pools.filter(p => p.ouId === formData.ouId).map(pool => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name} ({pool.startIP} - {pool.endIP})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                IP 地址
                <button
                  type="button"
                  onClick={() => fetchAvailableIp(formData.ouId!, formData.selectedPoolId)}
                  className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> 刷新
                </button>
              </label>
              <input
                type="text"
                required
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value, accountName: `yzd_${e.target.value.replace(/\./g, '_')}` })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="192.168.1.10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MAC 地址 (选填)</label>
              <input
                type="text"
                value={formData.mac}
                onChange={(e) => setFormData({ ...formData, mac: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="00:11:22:33:44:55"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">申请人</label>
              <input
                type="text"
                required
                value={formData.applicant}
                onChange={(e) => setFormData({ ...formData, applicant: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">安全责任人</label>
              <input
                type="text"
                required
                value={formData.safetyOfficer}
                onChange={(e) => setFormData({ ...formData, safetyOfficer: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={processing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm flex items-center gap-2"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              确认开户
            </button>
          </div>
        </form>
      )}

      {isAutoAdding && (
        <form onSubmit={handleAutoCreate} className="bg-white p-6 rounded-xl shadow-md border border-purple-100 space-y-6 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 text-purple-600 mb-2">
            <RefreshCw className="w-5 h-5" />
            <h3 className="font-semibold">自动批量开户</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">组织机构</label>
              <select
                required
                value={autoFormData.ouId}
                onChange={(e) => setAutoFormData({ ...autoFormData, ouId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
              >
                <option value="">选择 OU</option>
                {ous.map(ou => (
                  <option key={ou.id} value={ou.id}>{ou.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开户数量</label>
              <input
                type="number"
                min="1"
                required
                value={autoFormData.count}
                onChange={(e) => setAutoFormData({ ...autoFormData, count: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">申请人</label>
              <input
                type="text"
                required
                value={autoFormData.applicant}
                onChange={(e) => setAutoFormData({ ...autoFormData, applicant: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">安全责任人</label>
              <input
                type="text"
                required
                value={autoFormData.safetyOfficer}
                onChange={(e) => setAutoFormData({ ...autoFormData, safetyOfficer: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={autoFormData.remarks}
                onChange={(e) => setAutoFormData({ ...autoFormData, remarks: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsAutoAdding(false)}
              className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={processing}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-sm flex items-center gap-2"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              生成并导出
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">账号名称</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">IP 地址</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">所属机构</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">申请人</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">正在加载账号...</td>
              </tr>
            ) : filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">未找到账号。</td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">{acc.accountName}</span>
                      <span className="text-xs text-gray-400 font-mono">密码: {acc.password}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 font-mono">{acc.ip}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                      {ous.find(o => o.id === acc.ouId)?.name || '未知'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {acc.applicant}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeleteAccount(acc)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="注销账号"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </div>
  );
}
