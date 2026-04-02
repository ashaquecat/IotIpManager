import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { OrganizationUnit } from '../types';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { Modal } from './Modal';

export function OrganizationUnitManager() {
  const [ous, setOus] = useState<OrganizationUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'confirm' as 'confirm' | 'alert' | 'error', onConfirm: () => {} });

  const fetchOus = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'organizationUnits'), orderBy('name'));
      const querySnapshot = await getDocs(q);
      const fetchedOus = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationUnit));
      setOus(fetchedOus);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'organizationUnits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOus();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'organizationUnits'), formData);
      setFormData({ name: '', code: '' });
      setIsAdding(false);
      fetchOus();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'organizationUnits');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateDoc(doc(db, 'organizationUnits', id), formData);
      setEditingId(null);
      setFormData({ name: '', code: '' });
      fetchOus();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `organizationUnits/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    // Check if OU is used in any IP pools
    const q = query(collection(db, 'ipPools'), where('ouId', '==', id));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      setModalConfig({
        title: '无法删除',
        message: '该组织机构已被 IP 地址池绑定，请先删除相关的 IP 地址池。',
        type: 'alert',
        onConfirm: () => {}
      });
      setModalOpen(true);
      return;
    }

    setModalConfig({
      title: '确认删除',
      message: '您确定要删除这个组织机构吗？此操作不可撤销。',
      type: 'confirm',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'organizationUnits', id));
          fetchOus();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `organizationUnits/${id}`);
        }
      }
    });
    setModalOpen(true);
  };

  const startEdit = (ou: OrganizationUnit) => {
    setEditingId(ou.id!);
    setFormData({ name: ou.name, code: ou.code });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">组织机构管理</h2>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          添加组织机构
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4 animate-in slide-in-from-top duration-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">机构名称</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="例如：销售部"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">机构代码</label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="例如：SALES_001"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存机构
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">名称</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">代码</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">加载中...</td>
              </tr>
            ) : ous.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">未找到组织机构。</td>
              </tr>
            ) : (
              ous.map((ou) => (
                <tr key={ou.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    {editingId === ou.id ? (
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 font-medium">{ou.name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === ou.id ? (
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">{ou.code}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {editingId === ou.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(ou.id!)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(ou)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ou.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
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
