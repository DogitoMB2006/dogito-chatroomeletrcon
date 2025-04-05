import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

const CheckUpdates = () => {
  const [showModal, setShowModal] = useState(false);

  const handleOpen = () => setShowModal(true);
  const handleClose = () => setShowModal(false);

  const handleCheckUpdates = () => {
    setShowModal(false);
    toast.info("Buscando actualizaciones...", { autoClose: 3000 });

    if (window.electronAPI?.updates?.checkForUpdates) {
      window.electronAPI.updates.checkForUpdates();
    }
  };

  // ✅ Escuchar eventos desde Electron
  useEffect(() => {
    if (window.electronAPI?.updates) {
      window.electronAPI.updates.onUpdateAvailable(() => {
        toast.success("¡Hay una nueva actualización disponible!");
      });

      window.electronAPI.updates.onUpdateDownloaded(() => {
        toast.success("Actualización descargada. Puedes instalarla ahora.");
      });

      window.electronAPI.updates.onUpdateError(() => {
        toast.error("Ocurrió un error al buscar actualizaciones.");
      });

      window.electronAPI.updates.onUpdateAvailable(() => {
        console.log("📦 Evento recibido: update-available");
        toast.success("¡Hay una nueva actualización disponible!");
      });
      
    }
  }, []);

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
      >
        Verificar actualizaciones
      </button>

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
              >
                Buscar ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CheckUpdates;
