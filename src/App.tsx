import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, FileText, ArrowRight, CheckCircle2, AlertCircle, Loader2, Copy, Trash2, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CHUNK_SIZE = 1024 * 64; // 64KB chunks

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [file, setFile] = useState<File | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [receiveCode, setReceiveCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundFile, setFoundFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receivedChunks = useRef<Uint8Array[]>([]);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('room-created', (code) => {
      setRoomCode(code);
      setStatus('Waiting for peer to join...');
    });

    newSocket.on('receiver-joined', () => {
      setIsPeerConnected(true);
      setStatus('Peer connected! You can now select a file.');
    });

    newSocket.on('room-joined', ({ success, error }) => {
      setSearching(false);
      if (success) {
        setIsPeerConnected(true);
        setStatus('Connected to peer. Waiting for them to send a file...');
      } else {
        setError(error);
      }
    });

    newSocket.on('file-meta', (meta) => {
      setFoundFile(meta);
      setStatus('Receiving file...');
      setTransferring(true);
      setProgress(0);
      receivedChunks.current = [];
    });

    newSocket.on('file-chunk', (chunk: ArrayBuffer) => {
      receivedChunks.current.push(new Uint8Array(chunk));
      const receivedSize = receivedChunks.current.reduce((acc, c) => acc + c.length, 0);
      if (foundFile) {
        setProgress(Math.round((receivedSize / foundFile.size) * 100));
      }
    });

    newSocket.on('transfer-complete', () => {
      setStatus('Transfer complete!');
      setTransferring(false);
      const blob = new Blob(receivedChunks.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = foundFile?.name || 'downloaded-file';
      a.click();
      URL.revokeObjectURL(url);
      setFoundFile(null);
      setProgress(0);
    });

    newSocket.on('peer-disconnected', () => {
      setError('Peer disconnected.');
      setIsPeerConnected(false);
      setTransferring(false);
      setProgress(0);
      setRoomCode(null);
      setFoundFile(null);
    });

    return () => {
      newSocket.close();
    };
  }, [foundFile]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      // Automatically start sending if already connected
      if (isPeerConnected) {
        startSending(selectedFile);
      }
    }
  };

  const startSending = async (selectedFile: File) => {
    if (!selectedFile || !socket || !roomCode) return;
    setTransferring(true);
    setProgress(0);
    setStatus(`Sending ${selectedFile.name}...`);
    
    // Send metadata
    socket.emit('file-meta', {
      code: roomCode,
      meta: { name: selectedFile.name, size: selectedFile.size }
    });

    const reader = selectedFile.stream().getReader();
    let offset = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Send in chunks
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        const chunk = value.slice(i, i + CHUNK_SIZE);
        socket.emit('file-chunk', { code: roomCode, chunk });
        offset += chunk.length;
        setProgress(Math.round((offset / selectedFile.size) * 100));
      }
    }

    socket.emit('transfer-complete', roomCode);
    setTransferring(false);
    setFile(null);
    setStatus('Transfer complete!');
  };

  const handleCreateRoom = () => {
    if (!socket) return;
    socket.emit('create-room');
  };

  const handleJoinRoom = () => {
    if (receiveCode.length !== 6 || !socket) return;
    setSearching(true);
    setError(null);
    socket.emit('join-room', receiveCode);
  };

  const reset = () => {
    setFile(null);
    setRoomCode(null);
    setReceiveCode('');
    setFoundFile(null);
    setError(null);
    setProgress(0);
    setTransferring(false);
    setStatus('');
    setIsPeerConnected(false);
    if (socket) {
      socket.emit('leave-room');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-100/50 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-3xl animate-pulse delay-700" />
      </div>

      <div className="fixed top-4 right-4 z-50">
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
          connected ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
        )}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? "Server Connected" : "Disconnected"}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200 mb-4 text-white animate-float">
            <Wifi size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-2">QuickDrop</h1>
          <p className="text-zinc-500">Connect first, then stream files.</p>
        </header>

        <div className="bg-white rounded-3xl shadow-2xl shadow-zinc-200/50 border border-zinc-100 overflow-hidden">
          <div className="flex border-b border-zinc-100">
            <button 
              onClick={() => { setMode('send'); reset(); }}
              disabled={transferring}
              className={cn(
                "flex-1 py-4 text-sm font-semibold transition-all duration-200",
                mode === 'send' ? "text-emerald-600 bg-emerald-50/50" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              Send
            </button>
            <button 
              onClick={() => { setMode('receive'); reset(); }}
              disabled={transferring}
              className={cn(
                "flex-1 py-4 text-sm font-semibold transition-all duration-200",
                mode === 'receive' ? "text-emerald-600 bg-emerald-50/50" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              Receive
            </button>
          </div>

          <div className="p-8">
            <AnimatePresence mode="wait">
              {mode === 'send' ? (
                <motion.div
                  key="send"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {!roomCode ? (
                    <div className="space-y-6">
                      <div className="text-center space-y-2">
                        <p className="text-zinc-600 text-sm">Create a connection to start sharing files in real-time.</p>
                      </div>
                      <button
                        disabled={!connected}
                        onClick={handleCreateRoom}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        <span>Create Connection Code</span>
                        <ArrowRight size={20} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-6 py-4">
                      {isPeerConnected ? (
                        <div className="space-y-6">
                          <div className="flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 py-2 px-4 rounded-full text-sm font-medium mx-auto w-fit">
                            <CheckCircle2 size={16} />
                            <span>Peer Connected</span>
                          </div>

                          {transferring ? (
                            <div className="space-y-4">
                              <div className="relative w-24 h-24 mx-auto">
                                <svg className="w-full h-full" viewBox="0 0 100 100">
                                  <circle className="text-zinc-100 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                                  <circle 
                                    className="text-emerald-600 stroke-current transition-all duration-300" 
                                    strokeWidth="8" 
                                    strokeDasharray={251.2}
                                    strokeDashoffset={251.2 - (251.2 * progress) / 100}
                                    strokeLinecap="round" 
                                    fill="transparent" 
                                    r="40" 
                                    cx="50" 
                                    cy="50" 
                                  />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center font-bold text-zinc-900">
                                  {progress}%
                                </div>
                              </div>
                              <p className="text-sm font-medium text-zinc-600">{status}</p>
                            </div>
                          ) : (
                            <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="relative border-2 border-dashed border-emerald-500 bg-emerald-50/30 rounded-2xl p-8 transition-all cursor-pointer group hover:bg-emerald-50/50"
                            >
                              <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                              />
                              <div className="flex flex-col items-center text-center">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
                                  <Upload size={24} />
                                </div>
                                <p className="font-medium text-zinc-900">Select file to send</p>
                                <p className="text-xs text-zinc-500 mt-1">File will be streamed instantly</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                              <Wifi size={32} />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-zinc-900">Waiting for Peer</h3>
                            <p className="text-zinc-500 text-sm mt-1">Share this code with the other device</p>
                          </div>
                          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 text-4xl font-mono font-bold tracking-[0.5em] text-emerald-600 flex items-center justify-center">
                            {roomCode}
                          </div>
                          <p className="text-xs text-zinc-400 italic">Devices will connect automatically</p>
                        </>
                      )}
                      
                      {!transferring && (
                        <button 
                          onClick={reset}
                          className="text-zinc-400 hover:text-zinc-600 text-sm font-medium flex items-center justify-center gap-2 mx-auto"
                        >
                          <Trash2 size={16} />
                          <span>Cancel Connection</span>
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="receive"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {!isPeerConnected ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-zinc-700 ml-1">Enter 6-digit code</label>
                        <input 
                          type="text"
                          maxLength={6}
                          placeholder="000000"
                          value={receiveCode}
                          onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-5 text-center text-3xl font-mono font-bold tracking-[0.5em] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-200"
                        />
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                          <AlertCircle size={16} />
                          <span>{error}</span>
                        </div>
                      )}

                      <button
                        disabled={receiveCode.length !== 6 || searching || !connected}
                        onClick={handleJoinRoom}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        {searching ? (
                          <Loader2 className="animate-spin" size={20} />
                        ) : (
                          <>
                            <span>Connect to Peer</span>
                            <Download size={20} />
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="space-y-6 text-center">
                      <div className="flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 py-2 px-4 rounded-full text-sm font-medium mx-auto w-fit">
                        <CheckCircle2 size={16} />
                        <span>Connected to Peer</span>
                      </div>

                      {foundFile ? (
                        <div className="space-y-6">
                          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 flex items-center gap-4 text-left">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                              <FileText size={24} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-900 truncate">{foundFile.name}</p>
                              <p className="text-xs text-zinc-500">{formatSize(foundFile.size)}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="relative w-24 h-24 mx-auto">
                              <svg className="w-full h-full" viewBox="0 0 100 100">
                                <circle className="text-zinc-100 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                                <circle 
                                  className="text-emerald-600 stroke-current transition-all duration-300" 
                                  strokeWidth="8" 
                                  strokeDasharray={251.2}
                                  strokeDashoffset={251.2 - (251.2 * progress) / 100}
                                  strokeLinecap="round" 
                                  fill="transparent" 
                                  r="40" 
                                  cx="50" 
                                  cy="50" 
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center font-bold text-zinc-900">
                                {progress}%
                              </div>
                            </div>
                            <p className="text-sm font-medium text-zinc-600">{status}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="py-12 space-y-4">
                          <div className="w-16 h-16 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mx-auto animate-pulse">
                            <FileText size={32} />
                          </div>
                          <p className="text-zinc-500">Waiting for peer to select a file...</p>
                        </div>
                      )}

                      {!transferring && (
                        <button 
                          onClick={reset}
                          className="w-full text-zinc-400 hover:text-zinc-600 text-sm font-medium"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="mt-12 text-center text-zinc-400 text-xs">
          <p>© 2024 QuickDrop • Real-time Peer Relay</p>
        </footer>
      </motion.div>
    </div>
  );
}
