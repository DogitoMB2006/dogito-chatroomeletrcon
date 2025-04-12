import { useState, useRef } from "react";
import { 
  MdImage, 
  MdSend, 
  MdDelete,
  MdAdd,
  MdClose
} from "react-icons/md";
import { toast } from "react-toastify";
import EmojiSelector from "./EmojiSelector";
import GifSelector from "./GifSelector";

export default function MessageInput({ 
  receiver, 
  userData, 
  text = "",
  setText,
  image,
  setImage,
  replyTo, 
  setReplyTo, 
  onCantSendMessage,
  scrollToBottom,
  handleSend,
  handleImageClick,
  handleFileChange,
  fileInputRef,
  handleKeyDown,
  handleGifClick
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const emojiButtonRef = useRef(null);
  const gifButtonRef = useRef(null);
  const attachButtonRef = useRef(null);
  const textInputRef = useRef(null);

  // Manejar el clic en emoji
  const handleEmojiClick = (emoji) => {
    if (textInputRef.current) {
      const start = textInputRef.current.selectionStart || cursorPosition;
      const end = textInputRef.current.selectionEnd || cursorPosition;
      const beforeEmoji = text.substring(0, start);
      const afterEmoji = text.substring(end);
      const newText = beforeEmoji + emoji + afterEmoji;
      
      setText(newText);
      
      const newPosition = start + emoji.length;
      setCursorPosition(newPosition);
      
      setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus();
          textInputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 10);
    } else {
      setText(text + emoji);
    }
    
    // Cerrar el selector de emojis
    setShowEmojiPicker(false);
  };

  // Manejar click en el área de texto para actualizar posición del cursor
  const handleInputClick = () => {
    if (textInputRef.current) {
      setCursorPosition(textInputRef.current.selectionStart || 0);
    }
  };

  // Actualizar posición del cursor al escribir
  const handleInputKeyUp = () => {
    if (textInputRef.current) {
      setCursorPosition(textInputRef.current.selectionStart || 0);
    }
  };

  // Manejar envío del formulario
  const handleSubmit = (e) => {
    e && e.preventDefault();
    handleSend();
  };

  // Cerrar todos los menús
  const closeAllMenus = () => {
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
  };

  // Cierre de menús al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker && emojiButtonRef.current && !emojiButtonRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      
      if (showAttachMenu && attachButtonRef.current && !attachButtonRef.current.contains(event.target)) {
        setShowAttachMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker, showAttachMenu]);

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-700 px-3 py-3 bg-gray-800">
      {/* Previsualización de imagen */}
      {image && (
        <div className="mb-2 bg-gray-750 p-2 rounded text-sm text-gray-300 flex justify-between items-center">
          <span className="truncate mr-2">
            <span className="font-medium text-white">Imagen:</span> {image.name} 
            ({Math.round(image.size / 1024)} KB)
          </span>
          <button 
            type="button"
            onClick={() => setImage(null)}
            className="text-red-400 hover:text-red-300 p-1 rounded"
          >
            <MdDelete size={18} />
          </button>
        </div>
      )}
      
      <div className="flex items-center gap-2 relative">
        {/* Botón de adjuntar con menú */}
        <div className="relative" ref={attachButtonRef}>
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(!showAttachMenu);
              setShowEmojiPicker(false);
            }}
            className="text-gray-400 hover:text-gray-200 p-2 rounded-full hover:bg-gray-700"
            title="Adjuntar contenido"
          >
            <MdAdd size={20} />
          </button>
          
          {/* Menú desplegable de opciones para adjuntar */}
          {showAttachMenu && (
            <div className="absolute bottom-12 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 w-40 py-1 overflow-hidden animate-fade-in-down">
              <button
                type="button"
                onClick={() => {
                  handleImageClick();
                  setShowAttachMenu(false);
                }}
                className="flex items-center w-full px-3 py-2 text-gray-300 hover:bg-gray-700 text-sm"
              >
                <MdImage className="mr-2" size={18} />
                Imagen
              </button>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false);
                    // Mostrar el selector de GIFs - se maneja desde el componente GifSelector
                  }}
                  className="flex items-center w-full px-3 py-2 text-gray-300 hover:bg-gray-700 text-sm"
                >
                  <span role="img" aria-label="GIF" className="mr-2 text-base">🎞️</span>
                  GIF
                </button>
                
                {/* Componente GifSelector renderizado fuera del menú */}
                <div className="hidden">
                  <GifSelector 
                    onGifClick={handleGifClick}
                    buttonRef={gifButtonRef}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Input oculto para cargar archivos */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        
        {/* Selector de emojis */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowAttachMenu(false);
            }}
            className="text-gray-400 hover:text-gray-200 p-2 rounded-full hover:bg-gray-700"
            title="Emoji"
            ref={emojiButtonRef}
          >
            <span role="img" aria-label="emoji">😊</span>
          </button>
          
          {showEmojiPicker && (
            <EmojiSelector 
              onEmojiClick={handleEmojiClick} 
              buttonRef={emojiButtonRef}
            />
          )}
        </div>
        
        {/* Botón para GIFs */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              // Este botón ahora dirigirá directamente al componente GifSelector
              if (gifButtonRef.current) {
                gifButtonRef.current.click();
              }
              closeAllMenus();
            }}
            className="text-gray-400 hover:text-gray-200 p-2 rounded-full hover:bg-gray-700"
            title="GIF"
            ref={gifButtonRef}
          >
            <span role="img" aria-label="GIF">🎞️</span>
          </button>
          
          {/* Componente GifSelector - aparecerá cuando se haga clic */}
          <div className="hidden">
            <GifSelector 
              onGifClick={handleGifClick}
              buttonRef={gifButtonRef}
            />
          </div>
        </div>

        {/* Área de texto */}
        <textarea
          ref={textInputRef}
          placeholder="Escribe un mensaje..."
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px] max-h-24 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={handleInputClick}
          onKeyUp={handleInputKeyUp}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        {/* Botón de enviar */}
        <button
          type="submit"
          disabled={!text.trim() && !image}
          className={`p-2 rounded-full ${
            !text.trim() && !image
              ? "bg-gray-800 text-gray-500 cursor-not-allowed" 
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          <MdSend size={20} />
        </button>
      </div>
    </form>
  );
}