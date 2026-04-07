import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { IPPool, IPAddress, OrganizationUnit } from '../types';
import { ipToLong } from '../utils/ipUtils';
import { Search, Filter, Download, UserPlus, UserMinus, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from './Modal';

export function IPStatusViewer({ initialPoolId }: { initialPoolId?: string | null }) {
  const [pools, setPools] = useState<IPPool[]>([]);
  const [ous, setOus] = useState<OrganizationUnit[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>(initialPoolId || '');
  const [ipAddresses, setIpAddresses] = useState<IPAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchIp, setSearchIp] = useState('');
  const [selectedIps, setSelectedIps] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Grouping logic
  const groupedIps = ipAddresses.reduce((acc, ip) => {
    const parts = ip.ip.split('.');
    const prefix = parts.slice(0, 3).join('.');
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(ip);
    return acc;
  }, {} as Record<string, IPAddress[]>);

  const prefixes = Object.keys(groupedIps).sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });

  const currentPrefix = prefixes[currentPage - 1];
  const currentIps = currentPrefix ? groupedIps[currentPrefix] : [];
  const totalPages = prefixes.length;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'confirm' as 'confirm' | 'alert' | 'error', onConfirm: () => {} });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const poolsSnapshot = await getDocs(collection(db, 'ipPools'));
        const fetchedPools = poolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPPool));
        setPools(fetchedPools);
        
        // If initialPoolId is provided, use it. Otherwise use the first pool.
        if (initialPoolId) {
          setSelectedPoolId(initialPoolId);
        } else if (fetchedPools.length > 0 && !selectedPoolId) {
          setSelectedPoolId(fetchedPools[0].id!);
        }

        const ousSnapshot = await getDocs(collection(db, 'organizationUnits'));
        const fetchedOus = ousSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationUnit));
        setOus(fetchedOus);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'ipPools');
      }
    };
    fetchData();
  }, [initialPoolId]);

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

      const snapshot = await getDocs(q);
      let allIps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IPAddress));
      
      // Sort numerically by IP
      allIps.sort((a, b) => {
        const aParts = a.ip.split('.').map(Number);
        const bParts = b.ip.split('.').map(Number);
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
        }
        return 0;
      });
      
      if (searchIp) {
        allIps = allIps.filter(ip => ip.ip.includes(searchIp));
      }

      setTotalCount(allIps.length);
      setIpAddresses(allIps);
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
    if (selectedIps.length === currentIps.length) {
      setSelectedIps([]);
    } else {
      setSelectedIps(currentIps.map(ip => ip.id!));
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
            <h3 className="text-lg font-semibold text-gray-900">
              当前显示：
              <span className="text-gray-400 font-mono ml-2">
                {selectedPool ? `${selectedPool.startIP} -- ${selectedPool.endIP}` : '未选择地址池'}
              </span>
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              正在使用
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
              <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
              未使用
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selectedIps.length === currentIps.length && currentIps.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">全选当前页</span>
          </label>
          <div className="h-4 w-px bg-gray-200"></div>
          <span className="text-sm text-gray-500">
            已选择 <span className="font-bold text-blue-600">{selectedIps.length}</span> 个 IP
          </span>
          
          {totalPages > 1 && (
            <div className="ml-auto flex items-center gap-4">
              <div className="text-sm text-gray-500">
                网段: <span className="font-mono font-bold text-blue-600">{currentPrefix}.*</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {currentIps.map((ip) => {
              const isUsed = ip.status === 'used';
              const bgColor = isUsed ? 'bg-green-500' : 'bg-red-500';
              
              return (
                <div
                  key={ip.id}
                  onClick={() => toggleSelect(ip.id!)}
                  title={ip.ip}
                  className={`
                    w-8 h-8 flex items-center justify-center rounded text-[10px] font-mono font-bold text-white cursor-pointer transition-all
                    ${bgColor}
                    ${selectedIps.includes(ip.id!) ? 'ring-2 ring-offset-2 ring-blue-500 scale-110 z-10' : 'hover:opacity-80'}
                  `}
                >
                  {ip.ip.split('.').pop()}
                </div>
              );
            })}
          </div>
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
