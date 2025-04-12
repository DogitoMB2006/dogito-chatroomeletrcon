import { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import { db } from "../firebase/config";
import { useNavigate } from "react-router-dom";
import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { MdBlock, MdRemoveCircle } from "react-icons/md";
import { toast } from "react-toastify";

export default function BlockUser({ username, onBlockStatusChange, isMobileMenu = false }) {
  const { userData } = useContext(AuthContext);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Verificar si el usuario ya está bloqueado al cargar el componente
  useEffect(() => {
    const checkBlockStatus = async () => {
      if (!userData || !username) return;
      
      try {
        const blockDocRef = doc(db, "blockedUsers", `${userData.username}_${username}`);
        const blockDoc = await getDoc(blockDocRef);
        
        setIsBlocked(blockDoc.exists());
        
        // Notificar al componente padre del estado inicial
        if (onBlockStatusChange) {
          onBlockStatusChange(blockDoc.exists());
        }
      } catch (error) {
        console.error("Error al verificar estado de bloqueo:", error);
      }
    };

    checkBlockStatus();
  }, [userData, username, onBlockStatusChange]);

  const handleBlockUser = async () => {
    if (!userData || !username) return;
    
    setIsLoading(true);
    
    try {
      if (isBlocked) {
        // Desbloquear usuario
        await deleteDoc(doc(db, "blockedUsers", `${userData.username}_${username}`));
        setIsBlocked(false);
        toast.success(`Has desbloqueado a ${username}`);
        
        // Notificar al componente padre sobre el cambio
        if (onBlockStatusChange) {
          onBlockStatusChange(false);
        }
      } else {
        // Bloquear usuario
        await setDoc(doc(db, "blockedUsers", `${userData.username}_${username}`), {
          blocker: userData.username,
          blocked: username,
          timestamp: new Date().toISOString()
        });
        setIsBlocked(true);
        toast.success(`Has bloqueado a ${username}`);
        
        // Notificar al componente padre sobre el cambio
        if (onBlockStatusChange) {
          onBlockStatusChange(true);
        }
        
        // Si no es un menú móvil, redirigir al usuario a la página de chats
        if (!isMobileMenu) {
          navigate("/chat");
        }
      }
    } catch (error) {
      console.error("Error al bloquear/desbloquear usuario:", error);
      toast.error("Error al procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  // Si es para el menú móvil, devolver un diseño diferente
  if (isMobileMenu) {
    return (
      <button 
        onClick={handleBlockUser}
        className={`w-full flex items-center px-4 py-2 text-sm ${isBlocked ? 'text-green-400' : 'text-red-400'} hover:bg-gray-700`}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current mx-2"></div>
        ) : isBlocked ? (
          <MdRemoveCircle size={18} className="mr-2" />
        ) : (
          <MdBlock size={18} className="mr-2" />
        )}
        {isBlocked ? "Desbloquear usuario" : "Bloquear usuario"}
      </button>
    );
  }

  // Versión estándar para el sidebar o panel de información
  return (
    <button 
      className={`w-full py-2 ${
        isBlocked 
          ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" 
          : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700"
      } rounded text-white transition-colors flex items-center justify-center space-x-2`}
      onClick={handleBlockUser}
      disabled={isLoading}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          <span>Procesando...</span>
        </div>
      ) : (
        <>
          {isBlocked ? (
            <>
              <MdRemoveCircle size={18} />
              <span>Desbloquear usuario</span>
            </>
          ) : (
            <>
              <MdBlock size={18} />
              <span>Bloquear usuario</span>
            </>
          )}
        </>
      )}
    </button>
  );
}