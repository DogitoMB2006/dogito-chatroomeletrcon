import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

// Verificar si estamos en Electron de manera más robusta
const isElectron = () => {
  return window && 
         ((window.process && window.process.type === 'renderer') || 
          (typeof window.electronAPI !== 'undefined'));
};

// Variable global para facilitar las comprobaciones
const inElectron = isElectron();

const CheckUpdates = () => {
  const [showModal, setShowModal] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({
    checking: false,
    available: false,
    downloaded: false,
    progress: 0,
    version: null
  });

  const handleOpen = () => setShowModal(true);
  const handleClose = () => setShowModal(false);

  const handleCheckUpdates = () => {
    setShowModal(false);
    setUpdateStatus(prev => ({ ...prev, checking: true }));
    
    // Mostrar toast al iniciar la verificación
    toast.info("Buscando actualizaciones...", { autoClose: 3000 });

    // Verificar si la API de Electron está disponible
    if (inElectron && window.electronAPI?.updates?.checkForUpdates) {
      console.log("✅ Solicitando verificación de actualizaciones a Electron");
      window.electronAPI.updates.checkForUpdates();
    } else {
      console.log("❌ API de actualización no disponible");
      setTimeout(() => {
        setUpdateStatus(prev => ({ ...prev, checking: false }));
        toast.error("La verificación de actualizaciones no está disponible en este entorno");
      }, 1500);
    }
  };

  const handleInstallUpdate = () => {
    if (inElectron && window.electronAPI?.updates?.installUpdate) {
      window.electronAPI.updates.installUpdate();
      toast.info("Instalando actualización. La aplicación se reiniciará pronto...");
    }
  };

  // Configurar los listeners de actualización
  useEffect(() => {
    // Si no estamos en Electron, no hacer nada
    if (!inElectron || !window.electronAPI?.updates) {
      console.warn("API de actualización no disponible");
      return;
    }
    
    // Arreglo para guardar las funciones de limpieza
    const cleanupFunctions = [];

    // Función helper para registrar eventos con limpieza
    const registerEvent = (eventHandler, callback) => {
      if (typeof eventHandler === 'function') {
        try {
          const unsubscribe = eventHandler(callback);
          if (typeof unsubscribe === 'function') {
            cleanupFunctions.push(unsubscribe);
          }
        } catch (err) {
          console.error("Error al registrar evento:", err);
        }
      }
    };
    
    // Registrar todos los eventos disponibles
    
    // Evento: Verificando actualizaciones
    registerEvent(window.electronAPI.updates.onCheckingForUpdates, () => {
      console.log("🔍 Verificando actualizaciones...");
      setUpdateStatus(prev => ({ ...prev, checking: true }));
    });

    // Evento: Actualización disponible
    registerEvent(window.electronAPI.updates.onUpdateAvailable, (info) => {
      console.log("📦 Actualización disponible:", info);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        available: true,
        version: info.version || 'nueva versión'
      }));
      toast.success(`¡${info.version || 'Nueva versión'} disponible! Se descargará automáticamente.`, {
        autoClose: 5000
      });
    });

    // Evento: No hay actualizaciones
    registerEvent(window.electronAPI.updates.onUpdateNotAvailable, () => {
      console.log("✅ No hay actualizaciones disponibles");
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        available: false 
      }));
      toast.info("Tu aplicación está actualizada", {
        autoClose: 3000
      });
    });

    // Evento: Progreso de descarga
    registerEvent(window.electronAPI.updates.onUpdateProgress, (progressObj) => {
      const percent = progressObj.percent || 0;
      console.log(`⏳ Progreso: ${percent.toFixed(2)}%`);
      setUpdateStatus(prev => ({ 
        ...prev, 
        progress: percent 
      }));
      
      // Opcional: mostrar toast con el progreso actual cada 25%
      if (percent % 25 < 1 && percent > 0) {
        toast.info(`Descargando actualización: ${Math.floor(percent)}%`, {
          autoClose: 2000
        });
      }
    });

    // Evento: Actualización descargada
    registerEvent(window.electronAPI.updates.onUpdateDownloaded, (info) => {
      console.log("⬇️ Actualización descargada:", info);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false,
        downloaded: true,
        version: info.version || prev.version || 'nueva versión'
      }));
      
      // Mostrar toast interactivo
      toast.success(
        <div>
          <h4 className="font-bold">¡Actualización lista!</h4>
          <p className="mb-2">La versión {info.version || 'nueva'} está lista para instalar</p>
          <button 
            onClick={handleInstallUpdate}
            className="px-3 py-1 bg-white text-indigo-700 rounded hover:bg-gray-100 text-sm font-medium"
          >
            Instalar y reiniciar
          </button>
        </div>,
        {
          autoClose: false,
          closeOnClick: false,
          draggable: true
        }
      );
    });

    // Evento: Error de actualización
    registerEvent(window.electronAPI.updates.onUpdateError, (error) => {
      console.error("❌ Error de actualización:", error);
      setUpdateStatus(prev => ({ 
        ...prev, 
        checking: false 
      }));
      toast.error(`Error al buscar actualizaciones: ${error?.message || 'Error desconocido'}`, {
        autoClose: 5000
      });
    });

    // Limpiar los listeners al desmontar
    return () => {
      cleanupFunctions.forEach(cleanup => {
        if (typeof cleanup === 'function') {
          try {
            cleanup();
          } catch (err) {
            console.error("Error al limpiar event listener:", err);
          }
        }
      });
    };
  }, []);

  // Si no estamos en Electron o la API no está disponible, no mostrar el componente
  if (!inElectron || !window.electronAPI?.updates) {
    return null;
  }

  return (
    <>
      {/* Botón principal */}
      <button
        onClick={handleOpen}
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
        disabled={updateStatus.checking}
      >
        {updateStatus.checking ? 'Verificando...' : 'Verificar actualizaciones'}
      </button>

      {/* Botón de instalación (solo si hay una actualización descargada) */}
      {updateStatus.downloaded && (
        <button
          onClick={handleInstallUpdate}
          className="ml-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          Instalar ahora
        </button>
      )}

      {/* Indicador de progreso (opcional) */}
      {updateStatus.available && !updateStatus.downloaded && updateStatus.progress > 0 && (
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{ width: `${updateStatus.progress}%` }}
          ></div>
          <p className="text-xs text-gray-500 mt-1">
            Descargando {updateStatus.version}: {Math.floor(updateStatus.progress)}%
          </p>
        </div>
      )}

      {/* Modal de confirmación */}
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