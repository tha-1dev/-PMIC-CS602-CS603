import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat } from "@google/genai";

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Result is "data:mime/type;base64,the-base64-string"
      // We just want the base64 part
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};


const App = () => {
  const [chat, setChat] = useState<Chat | null>(null);
  // Update message type to include optional file preview URL
  const [messages, setMessages] = useState<{ role: string, text: string, file?: string }[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (!process.env.API_KEY) {
        setError("API_KEY environment variable not set.");
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const newChat = ai.chats.create({
        model: 'gemini-2.5-flash',
      });
      setChat(newChat);
    } catch (e: any) {
      setError(`Error initializing AI: ${e.message}`);
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Scroll to the bottom of the message list whenever messages change
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async () => {
    if ((!input.trim() && !file) || !chat || loading) return;

    const userMessage: { role: string, text: string, file?: string } = { role: 'user', text: input };
    if (file) {
      // Create a temporary URL for immediate UI feedback
      userMessage.file = URL.createObjectURL(file);
    }
    
    setMessages(prev => [...prev, userMessage]);
    
    const currentInput = input;
    const currentFile = file;

    setInput('');
    setFile(null);
    setLoading(true);
    setError(null);

    try {
      let response;
      if (currentFile) {
        const base64Data = await fileToBase64(currentFile);
        const imagePart = {
          inlineData: {
            mimeType: currentFile.type,
            data: base64Data,
          },
        };
        const textPart = { text: currentInput };
        // FIX: The `chat.sendMessage` method expects an object with a `message` property. For multipart content, the `message` property should be an array of `Part` objects. The `contents` property is used with `generateContent`, not `chat.sendMessage`.
        response = await chat.sendMessage({ message: [textPart, imagePart] });
      } else {
        response = await chat.sendMessage({ message: currentInput });
      }

      const modelMessage = { role: 'model', text: response.text };
      setMessages(prev => [...prev, modelMessage]);
    } catch (e: any) {
      const errorMessage = `Error sending message: ${e.message}`;
      setError(errorMessage);
      console.error(e);
       // Restore the user's input if sending fails so they can try again
      setMessages(prev => prev.slice(0, -1)); 
      setInput(currentInput);
      setFile(currentFile);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type.startsWith('image/')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError("Please select a valid image file.");
      }
    }
     // Allows selecting the same file again
    e.target.value = '';
  };

  const removeFile = () => {
    setFile(null);
  };

  return (
    <div className="app-container">
      <h1>Gemini Chat</h1>
      
      {error && <div className="error-message" role="alert">{error}</div>}

      <div 
        className="message-list" 
        ref={messageListRef}
        role="log"
        aria-live="polite"
      >
        {messages.map((msg, index) => (
          <div key={index} className={`message-bubble ${msg.role}-message`}>
            <div className="message-content">
              <strong>{msg.role === 'user' ? 'You' : 'Gemini'}</strong>
              {msg.file && (
                <img src={msg.file} alt="User upload" className="message-image" />
              )}
              {msg.text && msg.text.split('\n').map((line, i) => <span key={i}>{line}<br/></span>)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message-bubble model-message">
            <div className="message-content">
              <strong>Gemini</strong>
              <div className="typing-indicator" aria-label="Gemini is typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="input-area">
        {file && (
          <div className="file-preview-container">
            <img src={URL.createObjectURL(file)} alt="Preview" className="file-preview-image"/>
            <span className="file-preview-name" title={file.name}>{file.name}</span>
            <button onClick={removeFile} className="remove-file-button" aria-label="Remove file">
              &times;
            </button>
          </div>
        )}
        <div className="input-container">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <button
            className="attachment-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !chat}
            aria-label="Attach file"
          >
            📎
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
            placeholder="Ask Gemini something..."
            disabled={loading || !chat}
            aria-label="Chat input"
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || (!input.trim() && !file) || !chat}
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
