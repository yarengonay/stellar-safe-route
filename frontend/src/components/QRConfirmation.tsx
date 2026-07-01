import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, X, Check, AlertCircle } from 'lucide-react';

interface QRConfirmationProps {
  onScanSuccess: (code: string) => void;
  onClose: () => void;
}

export const QRConfirmation: React.FC<QRConfirmationProps> = ({ onScanSuccess, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    if (scannerActive) {
      // Initialize html5-qrcode scanner
      scanner = new Html5QrcodeScanner(
        'reader',
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          onScanSuccess(decodedText);
          if (scanner) {
            scanner.clear().catch(err => console.error("Error clearing scanner", err));
          }
          setScannerActive(false);
        },
        () => {
          setScanError('Align QR code inside the frame to scan.');
        }
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Error clearing scanner on unmount", err));
      }
    };
  }, [scannerActive, onScanSuccess]);

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScanSuccess(manualCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md glass rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-blue-400" />
            <h3 className="font-heading font-semibold text-lg text-slate-100">
              Confirm Delivery via QR
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Scanner Area */}
          {scannerActive ? (
            <div className="space-y-4">
              <div className="relative aspect-square w-full max-w-[280px] mx-auto overflow-hidden rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center">
                <div id="reader" className="w-full h-full"></div>
                <div className="absolute inset-0 border-2 border-dashed border-blue-500/30 pointer-events-none rounded-xl"></div>
              </div>
              <p className="text-xs text-center text-slate-400 flex items-center justify-center gap-1.5">
                <AlertCircle size={14} className="text-blue-400 animate-pulse" />
                {scanError || 'Scanning... Present the buyer\'s QR code.'}
              </p>
              <button
                type="button"
                onClick={() => setScannerActive(false)}
                className="w-full py-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors"
              >
                Switch to Manual Input
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="py-8 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                <Camera size={44} className="text-slate-500 mb-3" />
                <button
                  type="button"
                  onClick={() => setScannerActive(true)}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.02]"
                >
                  Start Camera Scanner
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Uses device camera to scan QR Code
                </p>
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800/80"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-xs font-semibold uppercase">Or Enter Code Manually</span>
                <div className="flex-grow border-t border-slate-800/80"></div>
              </div>

              {/* Manual Form */}
              <form onSubmit={handleSubmitManual} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                    Delivery Verification Pin
                  </label>
                  <input
                    type="password"
                    placeholder="e.g. secret123"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-slate-100 placeholder-slate-600 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-3 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-semibold text-sm transition-all disabled:opacity-50 disabled:hover:bg-slate-100 flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  Confirm Pin
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
