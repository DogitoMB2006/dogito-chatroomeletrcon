import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

const CheckUpdates = () => {
  const [showModal, setShowModal] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({
    checking: false,
    available: false,
    downloaded: false,
    progress: 0
  });

  const handleOpen = () => setShowModal(true);
  const handleClose = () => setShowModal(false);

  const handleCheckUpdates = () => {
    setShowModal(false);
    setUpdateStatus(prev => ({ ...prev, checking: true }));
    toast.info("Buscando actualizaciones...", { autoClose: 3000 });

    if (window.electronAPI?.updates?.checkForUpdates) {
      window.electronAPI.updates.checkForUpdates();
    }
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI?.updates?.installUpdate) {
      window.electronAPI.updates.installUpdate();
      toast.info("Instalando actualización. La aplicación se reiniciará pronto...");
    }
  };

  // Escuchar eventos desde Electron
  useEffect(() => {
    if (!window.electronAPI?.updates) {
      console.warn("API de actualización no disponible");
      return;
    }
    
    // Evento: Verificando actualizaciones
    window.electronAPI.updates.onCheckingForUpdates(() => {
      console.log("🔍 Verificando actualizaciones...");
      setUpdateStatus(prev => ({ ...prev, checking: true }));
    });

    // Evento: Actualización disponible
    window.electronAPI.updates.onUpdateAvailable((info) => {
      console.log("📦 Actualización disponible:", info);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        available: true 
      }));
      toast.success("¡Hay una nueva actualización disponible!");
    });

    // Evento: No hay actualizaciones
    window.electronAPI.updates.onUpdateNotAvailable(() => {
      console.log("✅ No hay actualizaciones disponibles");
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        available: false 
      }));
      toast.info("Tu aplicación está actualizada");
    });

    // Evento: Progreso de descarga
    window.electronAPI.updates.onUpdateProgress((progressObj) => {
      console.log(`⏳ Progreso: ${progressObj.percent.toFixed(2)}%`);
      setUpdateStatus(prev => ({ 
        ...prev, 
        progress: progressObj.percent 
      }));
    });

    // Evento: Actualización descargada
    window.electronAPI.updates.onUpdateDownloaded((info) => {
      console.log("⬇️ Actualización descargada:", info);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        downloaded: true 
      }));
      toast.success("Actualización descargada. Puedes instalarla ahora.", {
        autoClose: false,
        closeOnClick: false,
        draggable: true,
        onClick: () => handleInstallUpdate()
      });
    });

    // Evento: Error de actualización
    window.electronAPI.updates.onUpdateError((error) => {
      console.error("❌ Error de actualización:", error);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false 
      }));
      toast.error(`Error al buscar actualizaciones: ${error.message || 'Error desconocido'}`);
    });

    // Limpiar los listeners al desmontar
    return () => {
      // Aquí deberías desconectar los listeners si tu API lo permite
    };
  }, []);

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
        disabled={updateStatus.checking}
      >
        {updateStatus.checking ? 'Verificando...' : 'Verificar actualizaciones'}
      </button>

      {updateStatus.downloaded && (
        <button
          onClick={handleInstallUpdate}
          className="ml-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          Instalar ahora
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white dark:bg-gray-900 text-black dark:text-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">¿Buscar actualizaciones?</h2>
            <p className="mb-6">Se conectará con el servidor de GitHub para verificar nuevas versiones.</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded hover:bg-gray-400 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleCheckUpdates}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                disabled={updateStatus.checking}
              >
                {updateStatus.checking ? 'Buscando...' : 'Buscar ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CheckUpdates;