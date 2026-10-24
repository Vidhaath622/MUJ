import React, { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { FileDropzone } from '../domain/file-dropzone';
import { 
  X, 
  Database, 
  Upload, 
  Check 
} from 'lucide-react';
import { DocumentItem } from '../../types/ragseal';

interface DocumentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  onUploadDocument?: (file: File) => void;
}

export const DocumentVaultModal: React.FC<DocumentVaultModalProps> = ({
  isOpen,
  onClose,
  documents,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.document_id || '');
  const [activeTab, setActiveTab] = useState<'inspect' | 'upload'>('inspect');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentDoc = documents.find((d) => d.document_id === selectedDocId) || documents[0];

  const handleSimulateUpload = (files: File[]) => {
    if (files.length > 0) {
      setUploadStatus(`Uploaded and chunked ${files[0].name} (4 chunks extracted)`);
      setTimeout(() => setUploadStatus(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#090d16] border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
        {/* Modal Header */}
        <div className="p-4 md:px-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-950/60 border border-teal-800/40 text-teal-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Corpus Vault &amp; Chunks Inspector
                </h3>
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  5 Pre-loaded Documents
                </Badge>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                Inspect ATS recruitment policy, candidate resumes, and distractor chunks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 text-xs">
              <button
                onClick={() => setActiveTab('inspect')}
                className={`px-3 py-1 rounded-md font-mono transition ${
                  activeTab === 'inspect' ? 'bg-neutral-800 text-white' : 'text-neutral-400'
                }`}
              >
                Inspect Corpus
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1 rounded-md font-mono transition flex items-center gap-1 ${
                  activeTab === 'upload' ? 'bg-neutral-800 text-white' : 'text-neutral-400'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Upload New</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {activeTab === 'inspect' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Left: Document List */}
              <div className="space-y-2 md:border-r border-neutral-800 md:pr-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                  Corpus Documents:
                </span>
                {documents.map((doc) => {
                  const isSelected = doc.document_id === selectedDocId;
                  return (
                    <div
                      key={doc.document_id}
                      onClick={() => setSelectedDocId(doc.document_id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-600 text-white shadow-sm'
                          : 'bg-neutral-900/40 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-xs font-semibold truncate" title={doc.title}>
                          {doc.title}
                        </span>
                        {doc.status === 'superseded' ? (
                          <Badge variant="danger" size="sm">SUPERSEDED</Badge>
                        ) : doc.category === 'distractor' ? (
                          <Badge variant="warning" size="sm">DISTRACTOR</Badge>
                        ) : (
                          <Badge variant="success" size="sm">ACTIVE</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                        <span>{doc.filename}</span>
                        <span>{doc.chunk_count} chunks</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: Chunk Inspector */}
              <div className="md:col-span-2 space-y-3">
                {currentDoc ? (
                  <div>
                    <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 mb-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">{currentDoc.title}</h4>
                        <span className="text-[10px] font-mono text-neutral-400">
                          id: {currentDoc.document_id}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 font-mono flex items-center gap-3">
                        <span>File: {currentDoc.filename}</span>
                        {currentDoc.version && <span>Version: {currentDoc.version}</span>}
                      </div>
                    </div>

                    <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block mb-2">
                      Extracted Chunks ({currentDoc.chunks.length}):
                    </span>

                    <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                      {currentDoc.chunks.map((chk) => (
                        <div
                          key={chk.chunk_id}
                          className="p-3 rounded-lg bg-black/60 border border-neutral-800/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-teal-400 font-semibold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
                              {chk.chunk_id}
                            </span>
                            <span className="text-neutral-400">Page {chk.page}</span>
                          </div>
                          <p className="text-xs text-neutral-300 font-mono leading-relaxed bg-neutral-950 p-2.5 rounded border border-neutral-800/50">
                            {chk.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-neutral-500 font-mono text-xs">
                    No document selected.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-4 py-4">
              <div className="text-center space-y-1 mb-4">
                <h4 className="text-base font-bold text-white">Upload New Document to Corpus</h4>
                <p className="text-xs text-neutral-400">
                  Document will be parsed, chunked, and ingested into the evaluation vector index.
                </p>
              </div>

              <FileDropzone
                onFileSelect={(file) => handleSimulateUpload([file])}
                acceptedFormats={['.pdf', '.txt', '.md']}
                maxSizeMb={25}
              />

              {uploadStatus && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{uploadStatus}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs font-mono text-neutral-400">
          <span>Corpus indexed with hybrid BM25 + dense embedding vectors</span>
          <Button variant="outline" size="sm" onClick={onClose} className="border-neutral-700">
            Close Vault
          </Button>
        </div>
      </div>
    </div>
  );
};
