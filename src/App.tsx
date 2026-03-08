import React, { useState, useRef } from 'react';
import { Upload, Download, FileText, ArrowRight, CheckCircle2, AlertCircle, Loader2, Copy, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedCode, setUploadedCode] = useState<string | null>(null);
  const [receiveCode, setReceiveCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundFile, setFoundFile] = useState<{ original_name: string; size: number; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setUploadedCode(data.code);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleSearch = async () => {
    if (receiveCode.length !== 6) return;
    setSearching(true);
    setError(null);
    setFoundFile(null);

    try {
      const response = await fetch(`/api/file/${receiveCode}`);
      const data = await response.json();
      if (response.ok) {
        setFoundFile({ ...data, code: receiveCode });
      } else {
        setError(data.error || 'File not found');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = () => {
    if (!foundFile) return;
    window.location.href = `/api/download/${foundFile.code}`;
  };

  const reset = () => {
    setFile(null);
    setUploadedCode(null);
    setReceiveCode('');
    setFoundFile(null);
    setError(null);
  };

  const copyCode = () => {
    if (uploadedCode) {
      navigator.clipboard.writeText(uploadedCode);
      // Could add a toast here
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-100/50 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-3xl animate-pulse delay-700" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200 mb-4 text-white animate-float">
            <Upload size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-2">QuickDrop</h1>
          <p className="text-zinc-500">Fast, simple file sharing across devices.</p>
        </header>

        <div className="bg-white rounded-3xl shadow-2xl shadow-zinc-200/50 border border-zinc-100 overflow-hidden">
          <div className="flex border-b border-zinc-100">
            <button 
              onClick={() => { setMode('send'); reset(); }}
              className={cn(
                "flex-1 py-4 text-sm font-semibold transition-all duration-200",
                mode === 'send' ? "text-emerald-600 bg-emerald-50/50" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              Send File
            </button>
            <button 
              onClick={() => { setMode('receive'); reset(); }}
              className={cn(
                "flex-1 py-4 text-sm font-semibold transition-all duration-200",
                mode === 'receive' ? "text-emerald-600 bg-emerald-50/50" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              Receive File
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
                  {!uploadedCode ? (
                    <>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "relative border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer group",
                          file ? "border-emerald-500 bg-emerald-50/30" : "border-zinc-200 hover:border-emerald-400 hover:bg-zinc-50"
                        )}
                      >
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center text-center">
                          {file ? (
                            <>
                              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
                                <FileText size={24} />
                              </div>
                              <p className="font-medium text-zinc-900 truncate max-w-full px-4">{file.name}</p>
                              <p className="text-xs text-zinc-500 mt-1">{formatSize(file.size)}</p>
                            </>
                          ) : (
                            <>
                              <div className="w-12 h-12 bg-zinc-100 text-zinc-400 rounded-xl flex items-center justify-center mb-3 group-hover:text-emerald-500 group-hover:bg-emerald-50 transition-colors">
                                <Upload size={24} />
                              </div>
                              <p className="font-medium text-zinc-900">Click to select a file</p>
                              <p className="text-xs text-zinc-500 mt-1">Any file up to 2GB</p>
                            </>
                          )}
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
                          <AlertCircle size={16} />
                          <span>{error}</span>
                        </div>
                      )}

                      <button
                        disabled={!file || uploading}
                        onClick={handleUpload}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <span>Generate Code</span>
                            <ArrowRight size={20} />
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="text-center space-y-6 py-4">
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                          <CheckCircle2 size={32} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">File Ready!</h3>
                        <p className="text-zinc-500 text-sm mt-1">Share this code with the recipient</p>
                      </div>
                      <div className="relative group">
                        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 text-4xl font-mono font-bold tracking-[0.5em] text-emerald-600 flex items-center justify-center">
                          {uploadedCode}
                        </div>
                        <button 
                          onClick={copyCode}
                          className="absolute top-2 right-2 p-2 text-zinc-400 hover:text-emerald-600 transition-colors"
                          title="Copy Code"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                      <button 
                        onClick={reset}
                        className="text-zinc-400 hover:text-zinc-600 text-sm font-medium flex items-center justify-center gap-2 mx-auto"
                      >
                        <Trash2 size={16} />
                        <span>Send another file</span>
                      </button>
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
                  {!foundFile ? (
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
                        disabled={receiveCode.length !== 6 || searching}
                        onClick={handleSearch}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        {searching ? (
                          <Loader2 className="animate-spin" size={20} />
                        ) : (
                          <>
                            <span>Find File</span>
                            <Download size={20} />
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                          <FileText size={24} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 truncate">{foundFile.original_name}</p>
                          <p className="text-xs text-zinc-500">{formatSize(foundFile.size)}</p>
                        </div>
                      </div>

                      <button
                        onClick={handleDownload}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        <Download size={20} />
                        <span>Download File</span>
                      </button>

                      <button 
                        onClick={reset}
                        className="w-full text-zinc-400 hover:text-zinc-600 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="mt-12 text-center text-zinc-400 text-xs">
          <p>© 2024 QuickDrop • Secure Peer-to-Peer Sharing</p>
        </footer>
      </motion.div>
    </div>
  );
}
