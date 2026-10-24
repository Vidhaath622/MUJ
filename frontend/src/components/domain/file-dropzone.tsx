import React, { useState, useRef } from 'react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { UploadCloud, FileText } from 'lucide-react';

export interface FileDropzoneProps {
  onFileSelect?: (file: File) => void;
  acceptedFormats?: string[];
  maxSizeMb?: number;
  className?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileSelect,
  acceptedFormats = ['.pdf', '.txt', '.md'],
  maxSizeMb = 10,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      onFileSelect?.(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelect?.(file);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3',
          isDragging
            ? 'border-sky-400 bg-sky-950/20 scale-[1.01]'
            : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70',
          selectedFile && 'border-emerald-600/60 bg-emerald-950/10'
        )}
      >
        <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-sky-400 shadow-inner">
          <UploadCloud className="w-6 h-6" />
        </div>

        {selectedFile ? (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>{selectedFile.name}</span>
            </div>
            <p className="text-xs text-neutral-400 font-mono">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for chunking
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">
              Click to upload or drag &amp; drop document
            </h4>
            <p className="text-xs text-neutral-400">
              Supports {acceptedFormats.join(', ')} up to {maxSizeMb}MB
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Badge variant="outline" size="sm">
            Auto-Chunker Ready
          </Badge>
          <Badge variant="outline" size="sm">
            Embedding Extraction
          </Badge>
        </div>
      </div>
    </div>
  );
};
