import { useState, useRef } from "react";
import { db, storage } from "../../firebase/config";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";
import { 
  MdImage, 
  MdSend, 
  MdDelete
} from "react-icons/md";
import { toast } from "react-toastify";
import EmojiSelector from "./EmojiSelector";
import GifSelector from "./GifSelector"; // 👈 Importamos el nuevo componente

const HASHTAG_REGEX = /#(home|login|register|chat|editprofile)\b/g;

export default function MessageInput({ 
  receiver, 
  userData, 
  replyTo, 
  setReplyTo, 
  onCantSendMessage,
  scrollToBottom
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const fileInputRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const gifButtonRef = useRef(null); // 👈 Ref para el botón de gifs
  const [cursorPosition, setCursorPosition] = useState(0);
  const textInputRef = useRef(null);

  const sendMessage = async (e) => {
    e?.preventDefault();

    try {
      const myBlockDocRef = doc(db, "blockedUsers", `${userData.username}_${receiver}`);
      const theirBlockDocRef = doc(db, "blockedUsers", `${receiver}_${userData.username}`);
      const [myBlockDoc, theirBlockDoc] = await Promise.all([
        getDoc(myBlockDocRef),
        getDoc(theirBlockDocRef)
      ]);
      if (myBlockDoc.exists() || theirBlockDoc.exists()) {
        onCantSendMessage();
        return;
      }
    } catch (error) {
      console.error("Error al verificar bloqueo:", error);
    }

    if (text.trim() === '' && !image) return;

    let imageUrl = null;
    if (image) {
      const imageRef = ref(storage, `chatImages/${Date.now()}-${image.name}`);
      await uploadBytes(imageRef, image);
      imageUrl = await getDownloadURL(imageRef);
    }

    await addDoc(collection(db, "messages"), {
      from: userData.username,
      to: receiver,
      text: text.trim(),
      image: imageUrl,
      timestamp: serverTimestamp(),
      participants: [userData.username, receiver],
      read: false,
      replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
    });

    setText('');
    setImage(null);
    setReplyTo(null);
    scrollToBottom();
  };

  const handleImageClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

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
  };

  const handleGifClick = async (gifUrl) => {
    // Simulamos una "imagen cargada" directamente con el GIF
    await addDoc(collection(db, "messages"), {
      from: userData.username,
      to: receiver,
      text: "", // sin texto
      image: gifUrl, // link directo al GIF como si fuera una imagen
      timestamp: serverTimestamp(),
      participants: [userData.username, receiver],
      read: false,
      replyTo: replyTo ? { from: replyTo.from, text: replyTo.text } : null
    });
  
    scrollToBottom();
  };
  

  const handleInputClick = () => {
    if (textInputRef.current) {
      setCursorPosition(textInputRef.current.selectionStart || 0);
    }
  };

  const handleInputKeyUp = () => {
    if (textInputRef.current) {
      setCursorPosition(textInputRef.current.selectionStart || 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <form 
  onSubmit={sendMessage} 
  className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-700 px-4 py-4 bg-gray-800 sm:static sm:z-auto"
>
      {image && (
        <div className="mb-3 bg-gray-700 p-3 rounded-lg text-sm text-gray-200 flex justify-between items-center">
          <span className="truncate max-w-[80%]">
            Imagen: <strong>{image.name}</strong> 
            ({Math.round(image.size / 1024)} KB)
          </span>
          <button 
            type="button"
            onClick={() => setImage(null)}
            className="text-red-400 hover:text-red-300"
          >
            <MdDelete size={18} />
          </button>
        </div>
      )}
  
      <div className="flex items-center gap-2">
        {/* Botones laterales */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleImageClick}
            className="text-white p-2 rounded-full hover:bg-gray-700 transition"
            title="Adjuntar imagen"
          >
            <MdImage size={22} />
          </button>
  
          <EmojiSelector 
            onEmojiClick={handleEmojiClick} 
            buttonRef={emojiButtonRef} 
          />
  
          <GifSelector 
            onGifClick={handleGifClick}
            buttonRef={gifButtonRef}
          />
        </div>
  
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
  
        {/* Input de texto */}
        <input
          type="text"
          ref={textInputRef}
          placeholder="Escribe tu mensaje..."
          className="flex-1 bg-gray-700 border border-gray-600 rounded-full px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={handleInputClick}
          onKeyUp={handleInputKeyUp}
          onKeyDown={handleKeyDown}
        />
  
        {/* Botón de enviar */}
        <button
          type="submit"
          className={`p-2 rounded-full transition ${
            text.trim() || image
              ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
              : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
          disabled={!text.trim() && !image}
        >
          <MdSend size={22} />
        </button>
      </div>
    </form>
  );
  
}
