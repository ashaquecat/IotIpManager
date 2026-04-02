import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { IPPool, IPAddress, OrganizationUnit } from '../types';
import { ipToLong } from '../utils/ipUtils';
import { Search, Filter, Download, UserPlus, UserMinus, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from './Modal';

export function IPStatusViewer() {
  const [pools, setPools] = useState<IPPool[]>([]);
  const [ous, setOus] = useState<OrganizationUnit[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [ipAddresses, setIpAddresses] = useState<IPAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchIp, setSearchIp] = useState('');
  const [selectedIps, setSelectedIps] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(100);
  const [totalCount, setTotalCount] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'confirm' as 'confirm' | 'alert' | 'error', onConfirm: () => {} });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const poolsSnapshot = await getDocs(collection(db, 'ipPools'));
        const fetchedPools = poolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPPool));
        setPools(fetchedPools);
        if (fetchedPools.length > 0) setSelectedPoolId(fetchedPools[0].id!);

        const ousSnapshot = await getDocs(collection(db, 'organizationUnits'));
        const fetchedOus = ousSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationUnit));
        setOus(fetchedOus);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'ipPools');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedPoolId) {
      fetchIpAddresses();
    }
  }, [selectedPoolId, currentPage, searchIp]);

  const fetchIpAddresses = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'ipAddresses'),
        where('poolId', '==', selectedPoolId),
        orderBy('ip')
      );

      // Simple search filter
      const snapshot = await getDocs(q);
      let allIps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPAddress));
      
      // Sort numerically by IP
      allIps.sort((a, b) => ipToLong(a.ip) - ipToLong(b.ip));
      
      if (searchIp) {
        allIps = allIps.filter(ip => ip.ip.includes(searchIp));
      }

      setTotalCount(allIps.length);
      
      // Manual pagination
      const start = (currentPage - 1) * pageSize;
      const paginatedIps = allIps.slice(start, start + pageSize);
      setIpAddresses(paginatedIps);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'ipAddresses');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (type: 'open' | 'close') => {
    const selectedData = ipAddresses.filter(ip => selectedIps.includes(ip.id!));
    if (selectedData.length === 0) {
      setModalConfig({
        title: '未选择数据',
        message: '请至少选择一个 IP 地址进行导出。',
        type: 'alert',
        onConfirm: () => {}
      });
      setModalOpen(true);
      return;
    }

    const ou = ous.find(o => o.id === selectedData[0].ouId);
    
    const data = selectedData.map(ip => ({
      'IP地址': ip.ip,
      '组织机构': ou?.name || '未知',
      '建议账号': `yzd_${ip.ip.replace(/\./g, '_')}`,
      '状态': ip.status === 'used' ? '已使用' : '未使用',
      '申请人': '',
      '安全责任人': '',
      '备注': ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === 'open' ? '批量开户' : '批量销户');
    XLSX.writeFile(wb, `${type === 'open' ? '开户' : '销户'}_批量_${new Date().getTime()}.xlsx`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIps(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIps.length === ipAddresses.length) {
      setSelectedIps([]);
    } else {
      setSelectedIps(ipAddresses.map(ip => ip.id!));
    }
  };

  const selectedPool = pools.find(p => p.id === selectedPoolId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">地址池状态查看</h2>
        <div className="flex gap-3">
          <button
            onClick={() => handleExport('open')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            批量导出开户表
          </button>
          <button
            onClick={() => handleExport('close')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm text-sm font-medium"
          >
            <UserMinus className="w-4 h-4" />
            批量导出销户表
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">选择 IP 池</label>
          <select
            value={selectedPoolId}
            onChange={(e) => {
              setSelectedPoolId(e.target.value);
              setCurrentPage(1);
              setSelectedIps([]);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            {pools.map(pool => (
              <option key={pool.id} value={pool.id}>
                {pool.name} ({pool.startIP} - {pool.endIP})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">搜索 IP</label>
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchIp}
              onChange={(e) => setSearchIp(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如: 192.168.1.10"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIps.length === ipAddresses.length && ipAddresses.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">全选本页</span>
            </label>
            <span className="text-sm text-gray-500">
              已选择 {selectedIps.length} 个 IP
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-600">未使用</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-600">已使用</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="p-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {ipAddresses.map((ip) => (
              <div
                key={ip.id}
                onClick={() => toggleSelect(ip.id!)}
                className={`relative p-2 rounded-lg border transition-all cursor-pointer group ${
                  selectedIps.includes(ip.id!)
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full absolute top-1 right-1 ${
                    ip.status === 'unused' ? 'bg-red-500' : 'bg-green-500'
                  }`}></div>
                  <span className="text-[11px] font-mono font-bold text-gray-800">
                    {ip.ip.split('.').pop()}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono leading-none">
                    {ip.ip}
                  </span>
                </div>
                {selectedIps.includes(ip.id!) && (
                  <div className="absolute -top-1.5 -left-1.5 bg-blue-600 text-white rounded-full p-0.5 shadow-sm">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <p className="text-sm text-gray-500">
            显示第 {Math.min((currentPage - 1) * pageSize + 1, totalCount)} 至 {Math.min(currentPage * pageSize, totalCount)} 条，共 {totalCount} 个 IP
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              disabled={currentPage * pageSize >= totalCount}
              onClick={() => setCurrentPage(p => p + 1)}
              className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
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
