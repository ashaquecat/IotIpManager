import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { IPPool, OrganizationUnit, IPAddress } from '../types';
import { calculateUsableIPs } from '../utils/ipUtils';
import { Plus, Trash2, Edit2, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from './Modal';

export function IPPoolManager({ onViewStatus }: { onViewStatus?: (id: string) => void }) {
  const [pools, setPools] = useState<IPPool[]>([]);
  const [ous, setOus] = useState<OrganizationUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPool, setEditingPool] = useState<IPPool | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOu, setSearchOu] = useState('');
  const [processing, setProcessing] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'confirm' as 'confirm' | 'alert' | 'error', onConfirm: () => {} });

  const [formData, setFormData] = useState<Partial<IPPool>>({
    name: '',
    vlan: '',
    startIP: '',
    endIP: '',
    gatewayIP: '',
    subnetMask: '255.255.255.0',
    ouId: '',
    remarks: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const poolsSnapshot = await getDocs(collection(db, 'ipPools'));
      const fetchedPools = poolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPPool));
      setPools(fetchedPools);

      const ousSnapshot = await getDocs(collection(db, 'organizationUnits'));
      const fetchedOus = ousSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationUnit));
      setOus(fetchedOus);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'ipPools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isAdding || editingPool) {
      const vlanPart = formData.vlan ? `-VLAN${formData.vlan}` : '';
      const newRemarks = `${formData.name || ''}${vlanPart}`;
      if (formData.remarks !== newRemarks) {
        setFormData(prev => ({ ...prev, remarks: newRemarks }));
      }
    }
  }, [formData.name, formData.vlan, isAdding, editingPool]);

  const validatePool = async (poolId?: string) => {
    if (poolId) {
      const q = query(collection(db, 'ipAddresses'), where('poolId', '==', poolId), where('status', '==', 'used'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setModalConfig({
          title: '无法操作',
          message: '无法修改或删除此地址池，因为池内部分 IP 已被绑定使用。',
          type: 'alert',
          onConfirm: () => {}
        });
        setModalOpen(true);
        return false;
      }
    }
    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const usableIPs = calculateUsableIPs(
        formData.startIP!,
        formData.endIP!,
        formData.gatewayIP!,
        formData.subnetMask!
      );

      const poolData = {
        ...formData,
        totalCount: usableIPs.length,
        usedCount: 0
      } as IPPool;

      if (editingPool) {
        if (!(await validatePool(editingPool.id))) {
          setProcessing(false);
          return;
        }
        
        const oldIpsQuery = query(collection(db, 'ipAddresses'), where('poolId', '==', editingPool.id));
        const oldIpsSnapshot = await getDocs(oldIpsQuery);
        const batch = writeBatch(db);
        oldIpsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        batch.update(doc(db, 'ipPools', editingPool.id!), poolData as any);
        
        usableIPs.forEach(ip => {
          const newIpRef = doc(collection(db, 'ipAddresses'));
          batch.set(newIpRef, {
            ip,
            poolId: editingPool.id,
            status: 'unused',
            ouId: formData.ouId
          });
        });
        
        await batch.commit();
      } else {
        const poolRef = await addDoc(collection(db, 'ipPools'), poolData);
        
        const batchSize = 400;
        for (let i = 0; i < usableIPs.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = usableIPs.slice(i, i + batchSize);
          chunk.forEach(ip => {
            const ipRef = doc(collection(db, 'ipAddresses'));
            batch.set(ipRef, {
              ip,
              poolId: poolRef.id,
              status: 'unused',
              ouId: formData.ouId
            });
          });
          await batch.commit();
        }
      }

      setFormData({ startIP: '', endIP: '', gatewayIP: '', subnetMask: '255.255.255.0', ouId: '', remarks: '' });
      setIsAdding(false);
      setEditingPool(null);
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ipPools');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    setModalConfig({
      title: '确认删除',
      message: '您确定要删除此 IP 地址池吗？所有关联的 IP 记录都将被移除。',
      type: 'confirm',
      onConfirm: async () => {
        setProcessing(true);
        try {
          if (!(await validatePool(id))) {
            setProcessing(false);
            return;
          }

          const batch = writeBatch(db);
          const ipsQuery = query(collection(db, 'ipAddresses'), where('poolId', '==', id));
          const ipsSnapshot = await getDocs(ipsQuery);
          ipsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          batch.delete(doc(db, 'ipPools', id));
          await batch.commit();
          fetchData();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `ipPools/${id}`);
        } finally {
          setProcessing(false);
        }
      }
    });
    setModalOpen(true);
  };

  const filteredPools = pools.filter(pool => {
    const matchesIp = pool.startIP.includes(searchQuery) || pool.endIP.includes(searchQuery);
    const matchesOu = searchOu === '' || pool.ouId === searchOu;
    return matchesIp && matchesOu;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">IP 地址池配置</h2>
        <button
          onClick={() => {
            setEditingPool(null);
            setFormData({ startIP: '', endIP: '', gatewayIP: '', subnetMask: '255.255.255.0', ouId: '', remarks: '' });
            setIsAdding(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          创建地址池
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">按 IP 查询</label>
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="输入 IP 地址..."
            />
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">组织机构</label>
          <select
            value={searchOu}
            onChange={(e) => setSearchOu(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
          >
            <option value="">所有机构</option>
            {ous.map(ou => (
              <option key={ou.id} value={ou.id}>{ou.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-md border border-blue-100 space-y-6 relative overflow-hidden animate-in slide-in-from-top duration-200">
          {processing && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p className="text-sm font-medium text-blue-900">正在处理地址池并生成 IP 地址...</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">{editingPool ? '编辑 IP 地址池' : '新建 IP 地址池配置'}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始 IP</label>
              <input
                type="text"
                required
                value={formData.startIP}
                onChange={(e) => setFormData({ ...formData, startIP: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="192.168.1.10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束 IP</label>
              <input
                type="text"
                required
                value={formData.endIP}
                onChange={(e) => setFormData({ ...formData, endIP: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">子网掩码</label>
              <input
                type="text"
                required
                value={formData.subnetMask}
                onChange={(e) => setFormData({ ...formData, subnetMask: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="255.255.255.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">网关 IP</label>
              <input
                type="text"
                required
                value={formData.gatewayIP}
                onChange={(e) => setFormData({ ...formData, gatewayIP: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="192.168.1.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VLAN</label>
              <input
                type="text"
                required
                value={formData.vlan}
                onChange={(e) => setFormData({ ...formData, vlan: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="例如: 100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">绑定组织机构 (OU)</label>
              <select
                required
                value={formData.ouId}
                onChange={(e) => setFormData({ ...formData, ouId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">选择 OU</option>
                {ous.map(ou => (
                  <option key={ou.id} value={ou.id}>{ou.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地址池名称</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="例如: 办公网段"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="自动生成: 名称-VLAN"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingPool(null);
              }}
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
              {editingPool ? '更新地址池' : '生成地址池'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : filteredPools.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">暂未配置 IP 地址池。</p>
          </div>
        ) : (
          filteredPools.map((pool) => (
            <div 
              key={pool.id} 
              onClick={() => onViewStatus?.(pool.id!)}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all group cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {pool.name} ({pool.startIP} - {pool.endIP})
                    </h3>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-bold rounded uppercase">
                      {ous.find(o => o.id === pool.ouId)?.name || '未知机构'}
                    </span>
                    {pool.vlan && (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs font-bold rounded uppercase">
                        VLAN: {pool.vlan}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                    <p>网关: <span className="text-gray-700 font-medium">{pool.gatewayIP}</span></p>
                    <p>掩码: <span className="text-gray-700 font-medium">{pool.subnetMask}</span></p>
                    <p>可用 IP 数: <span className="text-blue-600 font-bold">{pool.totalCount}</span></p>
                  </div>
                  {pool.remarks && (
                    <p className="text-sm text-gray-400 italic mt-2">"{pool.remarks}"</p>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingPool(pool);
                      setFormData(pool);
                      setIsAdding(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="编辑地址池"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pool.id!);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除地址池"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
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
