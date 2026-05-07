
import React, { useState, useEffect } from 'react';
import { useParametros } from '../hooks/useParametros';
import { useToast } from '../context/useToast';

const ParametrosEmpresa = () => {
  const { 
    unidadesMedida,
    tiposProduto,
    categoriasDespesa,
    adicionarParametro,
    editarParametro,
    desativarParametro,
    excluirParametro,
  } = useParametros();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('unidadesMedida'); // unidadesMedida, tiposProduto, categoriasDespesa
  const [editingItem, setEditingItem] = useState(null);
  const [newItemName, setNewItemName] = useState('');

  const handleAddItem = async (paramType) => {
    if (newItemName.trim() === '') {
      showToast('O nome do parâmetro não pode ser vazio.', 'warning');
      return;
    }
    await adicionarParametro(paramType, newItemName);
    setNewItemName('');
  };

  const handleEditItem = async (paramType, id, newName, activeStatus) => {
    await editarParametro(paramType, id, newName, activeStatus);
    setEditingItem(null);
  };

  const handleToggleActive = async (paramType, id, currentStatus) => {
    await desativarParametro(paramType, id, !currentStatus);
  };

  const handleDeleteItem = async (paramType, id) => {
    if (window.confirm('Tem certeza que deseja excluir este parâmetro?')) {
      await excluirParametro(paramType, id);
    }
  };

  const filteredItems = (items) => {
    return items.filter(item => 
      item.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const renderParameterCard = (paramType, title, items) => (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">{title}</h2>
      
      {/* Search and New Item Input */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar parâmetro..."
          className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Novo nome..."
            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          <button 
            onClick={() => handleAddItem(paramType)}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
          >
            Novo Parâmetro
          </button>
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 && searchTerm === '' && (
        <div className="text-center text-gray-500 py-8">
          <p>Nenhum parâmetro de {title.toLowerCase()} encontrado.</p>
          <p>Comece adicionando um novo!</p>
        </div>
      )}

      {/* No Search Results */}
      {filteredItems(items).length === 0 && searchTerm !== '' && (
        <div className="text-center text-gray-500 py-8">
          <p>Nenhum resultado para "{searchTerm}" em {title.toLowerCase()}.</p>
        </div>
      )}

      {/* Parameter List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems(items).map(item => (
          <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-md shadow-sm">
            {editingItem?.id === item.id ? (
              <input
                type="text"
                value={editingItem.nome}
                onChange={(e) => setEditingItem({ ...editingItem, nome: e.target.value })}
                className="flex-grow p-1 border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <span className="text-gray-700 font-medium">{item.nome}</span>
            )}
            
            <div className="flex items-center gap-2">
              <span 
                className={`px-2 py-1 text-xs font-semibold rounded-full ${item.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {item.ativo ? 'Ativo' : 'Inativo'}
              </span>
              
              {editingItem?.id === item.id ? (
                <>
                  <button 
                    onClick={() => handleEditItem(paramType, item.id, editingItem.nome, editingItem.ativo)}
                    className="text-green-600 hover:text-green-800 transition-colors"
                    title="Salvar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setEditingItem(null)}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                    title="Cancelar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setEditingItem({ ...item })} 
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                    title="Editar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleToggleActive(paramType, item.id, item.ativo)}
                    className={`${item.ativo ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'} transition-colors`}
                    title={item.ativo ? 'Desativar' : 'Ativar'}
                  >
                    {item.ativo ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button 
                    onClick={() => handleDeleteItem(paramType, item.id)} 
                    className="text-red-600 hover:text-red-800 transition-colors"
                    title="Excluir"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Configuração de Parâmetros da Empresa</h1>

      <div className="mb-6 flex space-x-4 border-b border-gray-300">
        <button 
          className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'unidadesMedida' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          onClick={() => setActiveTab('unidadesMedida')}
        >
          Unidades de Medida
        </button>
        <button 
          className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'tiposProduto' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          onClick={() => setActiveTab('tiposProduto')}
        >
          Tipos de Produto
        </button>
        <button 
          className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'categoriasDespesa' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
          onClick={() => setActiveTab('categoriasDespesa')}
        >
          Categorias de Despesa
        </button>
      </div>

      {/* Loading State - not directly from useParametros, assuming it fetches initially */}
      {(!unidadesMedida || !tiposProduto || !categoriasDespesa) && (
        <div className="text-center text-gray-500 py-8">
          <p>Carregando parâmetros...</p>
        </div>
      )}

      {/* Render based on active tab */}
      {activeTab === 'unidadesMedida' && renderParameterCard('unidadesMedida', 'Unidades de Medida', unidadesMedida)}
      {activeTab === 'tiposProduto' && renderParameterCard('tiposProduto', 'Tipos de Produto', tiposProduto)}
      {activeTab === 'categoriasDespesa' && renderParameterCard('categoriasDespesa', 'Categorias de Despesa', categoriasDespesa)}
    </div>
  );
};

export default ParametrosEmpresa;
