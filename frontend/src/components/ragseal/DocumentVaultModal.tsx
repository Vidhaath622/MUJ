import React, { useState, useEffect } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { FileDropzone } from '../domain/file-dropzone';
import { 
  X, 
  Database, 
  Upload, 
  Check,
  AlertCircle,
  RotateCw 
} from 'lucide-react';
import { DocumentItem } from '../../types/ragseal';
import { uploadDocument, fetchDocuments, ApiError } from '../../lib/api';

interface DocumentVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentItem[];
  token?: string | null;
  onUploadSuccess?: () => void;
}

export const DocumentVaultModal: React.FC<DocumentVaultModalProps> = ({
  isOpen,
  onClose,
  documents: initialDocs,
  token,
  onUploadSuccess,
}) => {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocs);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocs[0]?.document_id || '');
  const [activeTab, setActiveTab] = useState<'inspect' | 'upload'>('inspect');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Sync initial docs and fetch user's documents if token present
  useEffect(() => {
    setDocuments(initialDocs);
    if (token) {
      fetchDocuments(token)
        .then((userDocs) => {
          if (userDocs && userDocs.length > 0) {
            const mappedUserDocs: DocumentItem[] = userDocs.map((ud) => ({
              document_id: ud.document_id,
              filename: ud.filename,
              title: ud.filename,
              chunk_count: ud.chunk_count,
              status: 'active',
              category: 'policy',
              chunks: (ud.chunks || []).map((c, idx) => ({
                chunk_id: c.chunk_id,
                text: c.text,
                page: c.ordinal || idx + 1,
              })),
            }));
            // Merge deduplicating by document_id
            setDocuments((prev) => {
              const existingIds = new Set(mappedUserDocs.map((d) => d.document_id));
              return [...mappedUserDocs, ...prev.filter((d) => !existingIds.has(d.document_id))];
            });
          }
        })
        .catch(() => {});
    }
  }, [initialDocs, token, isOpen]);

  if (!isOpen) return null;

  const currentDoc = documents.find((d) => d.document_id === selectedDocId) || documents[0];

  const handleUploadFile = async (file: File) => {
    if (!token) {
      setUploadError('Please sign in (Demo account available) to upload documents.');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    setUploadStatus(null);
    try {
      const res = await uploadDocument(file, token);
      setUploadStatus(`Ingested ${res.filename} into SQLite store (${res.chunk_count} chunks created)`);
      if (onUploadSuccess) onUploadSuccess();
      // Fetch latest documents to update list
      const latest = await fetchDocuments(token);
      if (latest && latest.length > 0) {
        const mapped = latest.map((ud) => ({
          document_id: ud.document_id,
          filename: ud.filename,
          title: ud.filename,
          chunk_count: ud.chunk_count,
          status: 'active' as const,
          category: 'policy' as const,
          chunks: (ud.chunks || []).map((c, idx) => ({
            chunk_id: c.chunk_id,
            text: c.text,
            page: c.ordinal || idx + 1,
          })),
        }));
        setDocuments((prev) => {
          const ids = new Set(mapped.map((d) => d.document_id));
          return [...mapped, ...prev.filter((d) => !ids.has(d.document_id))];
        });
        setSelectedDocId(res.document_id);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setUploadError(err.detail);
      } else {
        setUploadError(err.message || 'File upload failed');
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F6F3EC] backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#F6F3EC] border border-[#E3DED3] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#1B1B18]">
        {/* Modal Header */}
        <div className="p-4 md:px-6 border-b border-[#E3DED3] flex items-center justify-between bg-[#FBF9F4]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#E2EFEC] border border-[#1F6F6A]/40 text-[#1F6F6A]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1B1B18] tracking-tight">
                  Corpus Vault &amp; Chunks Inspector
                </h3>
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  5 Pre-loaded Documents
                </Badge>
              </div>
              <p className="text-[11px] text-[#5E5B53] font-mono">
                Inspect ATS recruitment policy, candidate resumes, and distractor chunks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#FBF9F4] p-0.5 rounded-lg border border-[#E3DED3] text-xs">
              <button
                onClick={() => setActiveTab('inspect')}
                className={`px-3 py-1 rounded-md font-mono transition ${
                  activeTab === 'inspect' ? 'bg-[#FBF9F4] text-[#1B1B18]' : 'text-[#5E5B53]'
                }`}
              >
                Inspect Corpus
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1 rounded-md font-mono transition flex items-center gap-1 ${
                  activeTab === 'upload' ? 'bg-[#FBF9F4] text-[#1B1B18]' : 'text-[#5E5B53]'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Upload New</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#FBF9F4] text-[#5E5B53] hover:text-[#1B1B18] transition"
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
              <div className="space-y-2 md:border-r border-[#E3DED3] md:pr-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#5E5B53] block mb-1">
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
                          ? 'bg-[#E3EAF2] border-[#2F5D8A]/40 text-[#1B1B18] shadow-sm'
                          : 'bg-[#FBF9F4] border-[#E3DED3] text-[#33322D] hover:bg-[#FBF9F4]'
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
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#5E5B53]">
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
                    <div className="p-3.5 rounded-xl bg-[#FBF9F4] border border-[#E3DED3] mb-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-[#1B1B18]">{currentDoc.title}</h4>
                        <span className="text-[10px] font-mono text-[#5E5B53]">
                          id: {currentDoc.document_id}
                        </span>
                      </div>
                      <div className="text-xs text-[#5E5B53] font-mono flex items-center gap-3">
                        <span>File: {currentDoc.filename}</span>
                        {currentDoc.version && <span>Version: {currentDoc.version}</span>}
                      </div>
                    </div>

                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#5E5B53] block mb-2">
                      Extracted Chunks ({currentDoc.chunks.length}):
                    </span>

                    <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                      {currentDoc.chunks.map((chk) => (
                        <div
                          key={chk.chunk_id}
                          className="p-3 rounded-lg bg-[#F6F3EC] border border-[#E3DED3] space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-[#1F6F6A] font-semibold bg-[#E2EFEC] px-2 py-0.5 rounded border border-[#1F6F6A]/40">
                              {chk.chunk_id}
                            </span>
                            <span className="text-[#5E5B53]">Page {chk.page}</span>
                          </div>
                          <p className="text-xs text-[#33322D] font-mono leading-relaxed bg-[#FBF9F4] p-2.5 rounded border border-[#E3DED3]">
                            {chk.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#6E6A62] font-mono text-xs">
                    No document selected.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-4 py-4">
              <div className="text-center space-y-1 mb-4">
                <h4 className="text-base font-bold text-[#1B1B18]">Upload New Document to Corpus</h4>
                <p className="text-xs text-[#5E5B53]">
                  Document will be parsed, chunked, and ingested into the evaluation vector index.
                </p>
              </div>

              <FileDropzone
                onFileSelect={(file) => handleUploadFile(file)}
                acceptedFormats={['.pdf', '.txt', '.md']}
                maxSizeMb={20}
              />

              {isUploading && (
                <div className="p-3 rounded-xl bg-[#E2EFEC] border border-[#1F6F6A]/40 text-xs text-[#1F6F6A] flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-[#1F6F6A] animate-spin" />
                  <span>Uploading and parsing document into chunks...</span>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-xl bg-[#F6E3E0] border border-[#B3261E]/40 text-xs text-[#B3261E] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#B3261E] flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadStatus && (
                <div className="p-3 rounded-xl bg-[#E6F0E8] border border-[#1F7A4D]/40 text-xs text-[#1F7A4D] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#1F7A4D]" />
                  <span>{uploadStatus}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#E3DED3] bg-[#FBF9F4] flex items-center justify-between text-xs font-mono text-[#5E5B53]">
          <span>Corpus indexed with hybrid BM25 + dense embedding vectors</span>
          <Button variant="outline" size="sm" onClick={onClose} className="border-[#E3DED3]">
            Close Vault
          </Button>
        </div>
      </div>
    </div>
  );
};
