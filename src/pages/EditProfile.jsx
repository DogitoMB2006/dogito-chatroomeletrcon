import { useState, useContext, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { AuthContext } from "../context/AuthContext";
import { auth, db } from "../firebase/config";
import { doc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/config"; 
import { useNavigate } from "react-router-dom";
import { MdArrowBack, MdPhoto, MdLink, MdCrop, MdClose, MdPerson, MdCheck } from "react-icons/md";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

// Helper function to crop image
const getCroppedImg = (imageSrc, pixelCrop) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('No 2d context'));
      }

      // Calculate canvas size
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      // Draw the cropped image
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // Convert to blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg');
    });
    image.src = imageSrc;
  });
};

// Función para validar URL de imagen
const isValidImageUrl = (url) => {
  // URL válida básica
  const urlPattern = /^(https?:\/\/)/i;
  
  // Extensiones de archivo comunes para imágenes/gifs
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  
  // Dominios comunes de imágenes
  const imageHosts = [
    'imgur.com',
    'i.imgur.com',
    'giphy.com',
    'media.giphy.com',
    'tenor.com',
    'c.tenor.com',
    'gfycat.com',
    'thumbs.gfycat.com',
    'media1.tenor.com',
    'media2.tenor.com',
    'media3.tenor.com',
    'media4.tenor.com',
    'media5.tenor.com',
    'media.tenor.com',
    'i.pinimg.com',
    'i.gifer.com',
    'media.discordapp.net',
    'cdn.discordapp.com'
  ];
  
  // Comprobar patrón URL
  if (!urlPattern.test(url)) return false;
  
  // Comprobar extensión de archivo
  if (imageExtensions.test(url)) return true;
  
  // Comprobar dominios conocidos de imágenes
  return imageHosts.some(host => url.includes(host));
};

export default function EditProfile() {
  const { user, userData, setUserData } = useContext(AuthContext);
  const [imageFile, setImageFile] = useState(null);
  const [originalPreviewURL, setOriginalPreviewURL] = useState(userData?.photoURL || null);
  const [previewURL, setPreviewURL] = useState(userData?.photoURL || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('local'); // 'local' o 'url'
  const [imageUrl, setImageUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isGif, setIsGif] = useState(false);

  // Username update states
  const [username, setUsername] = useState(userData?.username || '');
  const [originalUsername] = useState(userData?.username || '');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [usernameChanged, setUsernameChanged] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [showUsernameField, setShowUsernameField] = useState(false);

  // Crop states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);

  // Verificar disponibilidad del nombre de usuario
  useEffect(() => {
    // Si no ha cambiado o es el mismo que el original, no verificar
    if (username === originalUsername || !usernameChanged) {
      setUsernameAvailable(true);
      setUsernameError('');
      return;
    }

    // Validar longitud mínima
    if (username.length < 3) {
      setUsernameAvailable(false);
      setUsernameError('El nombre debe tener al menos 3 caracteres');
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snapshot = await getDocs(q);
        const isAvailable = snapshot.empty;
        setUsernameAvailable(isAvailable);
        setUsernameError(isAvailable ? '' : 'Este nombre de usuario ya está en uso');
      } catch (err) {
        console.error("Error al verificar nombre de usuario:", err);
        setUsernameError('Error al verificar disponibilidad');
      } finally {
        setCheckingUsername(false);
      }
    }, 700); 
    
    return () => clearTimeout(delayDebounce);
  }, [username, originalUsername, usernameChanged]);

  // Detectar cambios en el nombre de usuario
  useEffect(() => {
    setUsernameChanged(username !== originalUsername);
  }, [username, originalUsername]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setOriginalPreviewURL(reader.result);
      setPreviewURL(reader.result);
      setShowCropper(true);
      setIsGif(false);
    };
    setImageFile(file);
  };

  const handleUrlChange = (e) => {
    setImageUrl(e.target.value);
    setUrlError('');
  };

  const handleCheckUrl = async () => {
    // Validar formato básico de URL
    if (!isValidImageUrl(imageUrl)) {
      setUrlError('La URL no parece ser una imagen válida');
      return;
    }

    setLoading(true);
    
    try {
      // Verificar si la URL es accesible
      const response = await fetch(imageUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        setUrlError('No se pudo acceder a la imagen. Verifica la URL.');
        setLoading(false);
        return;
      }

      // Verificar si es un GIF (por la extensión o el Content-Type)
      const contentType = response.headers.get('Content-Type');
      const isGifImage = 
        imageUrl.toLowerCase().endsWith('.gif') || 
        (contentType && contentType.includes('image/gif'));
      
      setIsGif(isGifImage);
      
      // Para GIFs no necesitamos recortar
      if (isGifImage) {
        setPreviewURL(imageUrl);
        setOriginalPreviewURL(imageUrl);
      } else {
        // Para imágenes regulares, permitir recorte
        setOriginalPreviewURL(imageUrl);
        setPreviewURL(imageUrl);
        setShowCropper(true);
      }
      
    } catch (error) {
      setUrlError('Error al verificar la imagen: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirmCrop = async () => {
    try {
      // Get cropped image URL
      const croppedImageUrl = await getCroppedImg(
        originalPreviewURL,
        croppedAreaPixels
      );
      
      // Update preview with cropped image
      setPreviewURL(croppedImageUrl);
      setShowCropper(false);
    } catch (error) {
      console.error("Error cropping image:", error);
    }
  };

  const handleToggleUsernameField = () => {
    setShowUsernameField(!showUsernameField);
  };

  const handleUsernameChange = (e) => {
    setUsername(e.target.value);
  };

  const handleSave = async () => {
    // Verificar si hay cambios
    const profileChanged = previewURL !== userData?.photoURL || (usernameChanged && usernameAvailable);
    
    if (!profileChanged) {
      navigate("/chat");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userRef = doc(db, "users", user.uid);
      let finalPhotoUrl = userData?.photoURL;
      let updateData = {};

      // Actualizar foto de perfil si ha cambiado
      if (previewURL !== userData?.photoURL) {
        // Si estamos usando una URL (y especialmente si es un GIF)
        if (activeTab === 'url') {
          // Guardar directamente la URL externa
          finalPhotoUrl = previewURL;
        } else {
          // Subida normal a Firebase Storage
          const response = await fetch(previewURL);
          const blob = await response.blob();

          // Upload to Firebase
          const storageRef = ref(storage, `profileImages/${user.uid}`);
          await uploadBytes(storageRef, blob);
          finalPhotoUrl = await getDownloadURL(storageRef);
        }
        
        updateData.photoURL = finalPhotoUrl;
      }

      // Actualizar nombre de usuario si ha cambiado y está disponible
      if (usernameChanged && usernameAvailable) {
        updateData.username = username;
      }

      // Update user document with all changes
      await updateDoc(userRef, updateData);

      // Update local userData state so it reflects immediately across the app
      if (userData) {
        const updatedUserData = {
          ...userData,
          ...updateData
        };
        
        // Update the AuthContext with the new user data
        setUserData(updatedUserData);
      }

      // Mostrar mensaje de éxito
      const whatChanged = [];
      if (updateData.photoURL) whatChanged.push('foto');
      if (updateData.username) whatChanged.push('nombre de usuario');
      alert(`Se ha actualizado correctamente tu ${whatChanged.join(' y ')}`);
      
      navigate("/chat");
    } catch (error) {
      alert("Error al actualizar perfil: " + error.message);
      setError("Error al actualizar perfil: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Cropper Modal */}
      {showCropper && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg overflow-hidden w-full max-w-md shadow-2xl">
            <div className="relative h-[400px] w-full">
              <Cropper
                image={originalPreviewURL}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                cropShape="round"
                showGrid={false}
              />
            </div>
            
            <div className="p-4 bg-gray-900 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-gray-400 text-sm">Zoom</label>
                <input 
                  type="range" 
                  value={zoom} 
                  min={1} 
                  max={3} 
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-40 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div className="flex space-x-2">
                <button 
                  onClick={() => {
                    setShowCropper(false);
                    setPreviewURL(originalPreviewURL);
                  }}
                  className="flex-1 bg-gray-700 text-gray-300 px-4 py-2 rounded-md hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmCrop}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    
      <div className="bg-gray-800 p-4 flex items-center border-b border-gray-700">
        <button 
          onClick={() => navigate("/chat")}
          className="text-gray-300 hover:text-white mr-4"
        >
          <MdArrowBack size={24} />
        </button>
        <h1 className="text-xl font-semibold">Editar perfil</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg w-full max-w-md">
          <h2 className="text-xl font-bold mb-6 text-gray-100 text-center">Actualizar perfil</h2>

          {/* Mostrar error si existe */}
          {error && (
            <div className="bg-red-900/30 text-red-400 px-4 py-3 rounded-lg text-sm border border-red-800 mb-4">
              {error}
            </div>
          )}

          {/* Sección de nombre de usuario */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-gray-200">Nombre de usuario</h3>
              <button 
                onClick={handleToggleUsernameField}
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                {showUsernameField ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            {showUsernameField ? (
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MdPerson className="h-5 w-5 text-gray-500" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="Nuevo nombre de usuario"
                    className="bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 pr-10 py-3 rounded-lg"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    {checkingUsername && (
                      <AiOutlineLoading3Quarters className="animate-spin h-5 w-5 text-gray-400" />
                    )}
                    {!checkingUsername && usernameAvailable && username.length >= 3 && usernameChanged && (
                      <MdCheck className="h-5 w-5 text-green-500" />
                    )}
                    {!checkingUsername && !usernameAvailable && (
                      <MdClose className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </div>
                {usernameError && (
                  <p className="text-red-400 text-xs">{usernameError}</p>
                )}
                {username.length > 0 && username.length < 3 && (
                  <p className="text-red-400 text-xs">Mínimo 3 caracteres</p>
                )}
                {usernameAvailable && username.length >= 3 && usernameChanged && !usernameError && (
                  <p className="text-green-400 text-xs">Nombre disponible</p>
                )}
                {!usernameChanged && (
                  <p className="text-gray-400 text-xs">Ingresa un nombre diferente al actual</p>
                )}
              </div>
            ) : (
              <div className="bg-gray-700 py-3 px-4 rounded-lg">
                <span className="text-gray-200">{userData?.username}</span>
              </div>
            )}
          </div>

          {/* Preview de la imagen */}
          <div className="relative w-40 h-40 mx-auto rounded-full bg-gray-700 mb-6 overflow-hidden group">
            {previewURL ? (
              <img src={previewURL} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-700">
                <span className="text-gray-400">😶</span>
              </div>
            )}
            
            {previewURL && (
              <button 
                onClick={() => {
                  setPreviewURL(null);
                  setOriginalPreviewURL(null);
                  setImageFile(null);
                  setImageUrl('');
                  setIsGif(false);
                }}
                className="absolute top-2 right-2 bg-gray-900 bg-opacity-60 text-white p-1 rounded-full hover:bg-opacity-80 transition-all"
              >
                <MdClose size={16} />
              </button>
            )}
          </div>

          {/* Tabs para seleccionar el tipo de subida */}
          <div className="mb-6">
            <div className="flex border-b border-gray-700 mb-4">
              <button
                className={`flex-1 py-2 font-medium text-sm ${
                  activeTab === 'local'
                    ? 'text-indigo-400 border-b-2 border-indigo-400'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
                onClick={() => setActiveTab('local')}
              >
                <div className="flex items-center justify-center space-x-2">
                  <MdPhoto size={18} />
                  <span>Desde dispositivo</span>
                </div>
              </button>
              <button
                className={`flex-1 py-2 font-medium text-sm ${
                  activeTab === 'url'
                    ? 'text-indigo-400 border-b-2 border-indigo-400'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
                onClick={() => setActiveTab('url')}
              >
                <div className="flex items-center justify-center space-x-2">
                  <MdLink size={18} />
                  <span>Desde URL</span>
                </div>
              </button>
            </div>

            {/* Tab Content - Local File */}
            {activeTab === 'local' && (
              <div>
                <button
                  onClick={() => document.getElementById("fileInput").click()}
                  className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md flex items-center justify-center space-x-2 transition-colors"
                >
                  <MdPhoto size={20} />
                  <span>Seleccionar imagen</span>
                </button>
                <input
                  type="file"
                  id="fileInput"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                {imageFile && (
                  <div className="mt-2 text-sm text-gray-400 text-center">
                    {imageFile.name}
                  </div>
                )}
              </div>
            )}

            {/* Tab Content - URL */}
            {activeTab === 'url' && (
              <div>
                <div className="flex space-x-2 mb-2">
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={handleUrlChange}
                    placeholder="Pega la URL de la imagen (incluso GIFs)"
                    className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded-md border border-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleCheckUrl}
                    disabled={!imageUrl.trim() || loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Cargando...' : 'Verificar'}
                  </button>
                </div>
                {urlError && (
                  <div className="text-red-400 text-sm mt-1">
                    {urlError}
                  </div>
                )}
                {isGif && previewURL && (
                  <div className="mt-2 text-center text-green-400 text-sm font-medium">
                    ¡GIF detectado! Se usará sin recorte.
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-400">
                  <p>Puedes usar URLs de Giphy, Tenor, Imgur, Discord, etc.</p>
                  <p>Los GIFs animados solo funcionan por URL.</p>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSave}
              disabled={loading || (usernameChanged && !usernameAvailable)}
              className="bg-indigo-600 text-white px-4 py-3 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Actualizando...
                </span>
              ) : "Guardar cambios"}
            </button>
            
            <button
              onClick={() => navigate("/chat")}
              className="text-gray-400 hover:text-gray-300 px-4 py-2 rounded-md border border-gray-700 hover:border-gray-600 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
        
        <div className="mt-6 text-gray-400 text-sm text-center">
          <p>Puedes actualizar tu nombre de usuario y foto de perfil.</p>
          <p>Los GIFs animados solo están disponibles usando URLs.</p>
        </div>
      </div>
    </div>
  );
}