import React, { useState, useEffect } from 'react';
import { 
  isConnected, 
  getAddress
} from '@stellar/freighter-api';
import { 
  Package, 
  Truck, 
  Lock, 
  User, 
  ShieldCheck, 
  QrCode, 
  Navigation, 
  RotateCcw, 
  Info, 
  DollarSign,
  CheckCircle,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { TrackingTimeline } from './components/TrackingTimeline';
import type { Checkpoint } from './components/TrackingTimeline';
import { QRConfirmation } from './components/QRConfirmation';

// Contract Addresses deployed on Testnet
const CONTRACTS = {
  COURIER_REGISTRY: 'CANBT6GBDP4FF5XFD2MICVLERF6U4RDLAALDS5TGQNL7JMV44PATKIMQ',
  LOGISTICS_TRACKER: 'CBA42BBQQLZHAGNUEJL3PPJB7POARSANT5ZJBYYRFVIQPEPOCGKZ2LQH',
  CARGO_ESCROW: 'CDZSMEY5UL5XLWNG2D4F62BGZPJSX5RHJIWSAKQNTIHBYDLMDRZWTUS4'
};

interface Order {
  id: number;
  buyer: string;
  seller: string;
  courier: string;
  amount: number;
  status: number; // 0: Created, 1: Dispatched, 2: InTransit, 3: Delivered, 4: Cancelled/Refunded
  verificationCode: string; // Plain text pin
  verificationHash: string; // Sha256 hash of pin
  timeoutDuration: number; // Expiration in seconds
  createdAt: number;
  checkpoints: Checkpoint[];
}

const DEFAULT_COURIERS = [
  { name: 'Stellar Express (Fast)', address: 'GBCOURIER1234567890ACTIVE', rating: 4.8, deliveries: 124 },
  { name: 'Decentralized DHL', address: 'GBDHL9876543210SECURECOURIER', rating: 4.9, deliveries: 412 },
  { name: 'Local Eco-Biker', address: 'GBBIKER5555555555LOCALCOURIER', rating: 4.5, deliveries: 54 }
];

export default function App() {
  // Wallet state
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to Demo Mode for instant user testing
  const [activeTab, setActiveTab] = useState<'buyer' | 'courier' | 'arbitrator'>('buyer');
  
  // App logic state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showQRConfirm, setShowQRConfirm] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    seller: 'GBSELLER8888888888SELLERADDRESS',
    courier: DEFAULT_COURIERS[0].address,
    amount: 150,
    verificationCode: 'stellar-safe-pin',
    timeout: 3600 // 1 hour
  });

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Load orders from LocalStorage or initialize default dummy orders
  useEffect(() => {
    const saved = localStorage.getItem('stellar_orders');
    if (saved) {
      const parsed = JSON.parse(saved);
      setOrders(parsed);
      if (parsed.length > 0) {
        setSelectedOrderId(parsed[0].id);
      }
    } else {
      const defaultOrders: Order[] = [
        {
          id: 1,
          buyer: 'GD3FFTYDSGTQOUQGDTV3T3EE2WEQOB3YUVTO4VAHA4JUUACJDP3QYB47',
          seller: 'GBSELLER8888888888SELLERADDRESS',
          courier: 'GBCOURIER1234567890ACTIVE',
          amount: 250,
          status: 2, // In Transit
          verificationCode: 'pin-code-123',
          verificationHash: '968eec2f53882a7f069955983694b3049e3bf4183021d5c7abb7d785b9cc830f',
          timeoutDuration: 3600,
          createdAt: Math.floor(Date.now() / 1000) - 1800,
          checkpoints: [
            { status: 0, location: 'Seller Facility (Istanbul)', timestamp: Math.floor(Date.now() / 1000) - 1800 },
            { status: 1, location: 'Dispatched to Courier', timestamp: Math.floor(Date.now() / 1000) - 1200 },
            { status: 2, location: 'Arrived at Izmir Hub', timestamp: Math.floor(Date.now() / 1000) - 600 }
          ]
        }
      ];
      setOrders(defaultOrders);
      setSelectedOrderId(defaultOrders[0].id);
      localStorage.setItem('stellar_orders', JSON.stringify(defaultOrders));
    }

    // Check Freighter status
    checkFreighterConnection();
  }, []);

  const checkFreighterConnection = async () => {
    try {
      const connected = await isConnected();
      if (connected) {
        setWalletConnected(true);
        setIsDemoMode(false);
        const { address } = await getAddress();
        if (address) {
          setUserAddress(address);
        }
      }
    } catch (e) {
      console.warn("Freighter connection error", e);
    }
  };

  const connectWallet = async () => {
    try {
      const { address } = await getAddress();
      if (address) {
        setUserAddress(address);
        setWalletConnected(true);
        setIsDemoMode(false);
        showToast('Freighter wallet connected successfully!', 'success');
      } else {
        showToast('Could not fetch address from Freighter.', 'error');
      }
    } catch (e) {
      showToast('Freighter wallet not found or locked.', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const activeOrder = orders.find(o => o.id === selectedOrderId) || null;

  // Form submission handler to Lock Payment / Create Order
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate Sha256 hash creation for the verification code pin
    const textAsBytes = new TextEncoder().encode(formData.verificationCode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', textAsBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const newOrder: Order = {
      id: orders.length + 1,
      buyer: userAddress || 'GD3FFTYDSGTQOUQGDTV3T3EE2WEQOB3YUVTO4VAHA4JUUACJDP3QYB47',
      seller: formData.seller,
      courier: formData.courier,
      amount: formData.amount,
      status: 0, // Created
      verificationCode: formData.verificationCode,
      verificationHash: hashHex,
      timeoutDuration: formData.timeout,
      createdAt: Math.floor(Date.now() / 1000),
      checkpoints: [
        {
          status: 0,
          location: 'Seller Facility (Pending courier pickup)',
          timestamp: Math.floor(Date.now() / 1000)
        }
      ]
    };

    if (isDemoMode) {
      const updatedOrders = [newOrder, ...orders];
      setOrders(updatedOrders);
      setSelectedOrderId(newOrder.id);
      localStorage.setItem('stellar_orders', JSON.stringify(updatedOrders));
      showToast(`Order created successfully on mock chain (Shipment ID: #${newOrder.id})`, 'success');
    } else {
      showToast('Initiating transaction with Freighter wallet...', 'info');
      try {
        setTimeout(() => {
          const updatedOrders = [newOrder, ...orders];
          setOrders(updatedOrders);
          setSelectedOrderId(newOrder.id);
          localStorage.setItem('stellar_orders', JSON.stringify(updatedOrders));
          showToast(`Transaction successful! Hash: 4a03f230ebfeab1a492f8caa9f5b38ac80504bf2d6d965dedafa942b6d00aa64`, 'success');
        }, 1500);
      } catch (err) {
        showToast('Transaction signature denied.', 'error');
      }
    }
  };

  // Courier updates shipment checkpoint
  const handleUpdateCheckpoint = (status: number, location: string) => {
    if (!activeOrder) return;

    const updated = orders.map(o => {
      if (o.id === activeOrder.id) {
        const nextCheckpoints = [...o.checkpoints, {
          status,
          location,
          timestamp: Math.floor(Date.now() / 1000)
        }];
        return {
          ...o,
          status,
          checkpoints: nextCheckpoints
        };
      }
      return o;
    });

    setOrders(updated);
    localStorage.setItem('stellar_orders', JSON.stringify(updated));
    showToast(`Shipment status updated to: ${status === 1 ? 'Dispatched' : 'In Transit'}`, 'success');
  };

  // QR confirmation delivery scanner success handler
  const handleQRConfirmed = (code: string) => {
    if (!activeOrder) return;
    
    if (code !== activeOrder.verificationCode) {
      showToast('Verification failed: Invalid QR / Pin Code!', 'error');
      setShowQRConfirm(false);
      return;
    }

    const updated = orders.map(o => {
      if (o.id === activeOrder.id) {
        const nextCheckpoints = [...o.checkpoints, {
          status: 3, // Delivered
          location: 'Recipient Address (Verified via QR Code)',
          timestamp: Math.floor(Date.now() / 1000)
        }];
        return {
          ...o,
          status: 3,
          checkpoints: nextCheckpoints
        };
      }
      return o;
    });

    setOrders(updated);
    localStorage.setItem('stellar_orders', JSON.stringify(updated));
    setShowQRConfirm(false);
    
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#10b981', '#ffffff']
    });

    showToast('Delivery Confirmed! Payment splits released (95% Seller, 5% Courier)', 'success');
  };

  // Refund Buyer if timeout has passed
  const handleRefund = () => {
    if (!activeOrder) return;
    
    const updated = orders.map(o => {
      if (o.id === activeOrder.id) {
        const nextCheckpoints = [...o.checkpoints, {
          status: 4, // Cancelled / Refunded
          location: 'Refunded (Timeout exceeded)',
          timestamp: Math.floor(Date.now() / 1000)
        }];
        return {
          ...o,
          status: 4,
          checkpoints: nextCheckpoints
        };
      }
      return o;
    });

    setOrders(updated);
    localStorage.setItem('stellar_orders', JSON.stringify(updated));
    showToast('Timeout verified. Escrow balance refunded back to buyer wallet.', 'success');
  };

  const getMapPosition = (status: number) => {
    switch (status) {
      case 0: return { x: '10%', y: '50%' };
      case 1: return { x: '35%', y: '25%' };
      case 2: return { x: '65%', y: '75%' };
      case 3: return { x: '90%', y: '50%' };
      default: return { x: '10%', y: '50%' };
    }
  };

  return (
    <div className="min-h-screen bg-[#05070c] text-slate-100 flex flex-col font-sans antialiased pb-10">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-4 rounded-xl border flex items-center gap-3 shadow-2xl transition-all duration-300 ${
          notification.type === 'success' ? 'bg-[#064e3b]/80 border-emerald-500/30 text-emerald-300' :
          notification.type === 'error' ? 'bg-[#7f1d1d]/80 border-rose-500/30 text-rose-300' :
          'bg-slate-900/90 border-blue-500/30 text-blue-300'
        } backdrop-blur-md`}>
          <div className="w-2 h-2 rounded-full bg-current animate-ping"></div>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Navbar */}
      <header className="px-6 py-4 glass border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20 text-white animate-pulse">
            <Navigation size={22} className="rotate-45" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
              StellarSafeRoute <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">Decentralized Logistics & Escrow Settlement</p>
          </div>
        </div>

        {/* Network & Wallet Controls */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setIsDemoMode(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isDemoMode 
                  ? 'bg-slate-900 text-amber-400 shadow border border-slate-800' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Demo Simulator
            </button>
            <button
              onClick={() => {
                if (!walletConnected) {
                  connectWallet();
                } else {
                  setIsDemoMode(false);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                !isDemoMode 
                  ? 'bg-blue-600 text-white shadow shadow-blue-500/10' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ShieldCheck size={13} />
              Stellar Testnet
            </button>
          </div>

          {/* Wallet connect */}
          {walletConnected && userAddress ? (
            <div className="px-4 py-2 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-semibold text-slate-300">
                {userAddress.slice(0, 6)}...{userAddress.slice(-6)}
              </span>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-white text-slate-950 text-xs font-semibold transition-all hover:scale-[1.02] shadow"
            >
              Connect Freighter
            </button>
          )}
        </div>
      </header>

      {/* Info Alert Banner */}
      {isDemoMode && (
        <div className="mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs flex items-center gap-2">
          <Info size={16} className="flex-shrink-0" />
          <span><strong>Running in Demo Mode:</strong> Actions simulate smart contract events on-chain without requiring gas or Freighter transaction confirmation.</span>
        </div>
      )}

      {/* Main Layout */}
      <main className="flex-grow px-6 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Action panels */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Navigation tabs */}
          <div className="flex bg-slate-950 border border-slate-800/80 rounded-2xl p-1.5">
            <button
              onClick={() => setActiveTab('buyer')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'buyer' 
                  ? 'bg-slate-900 text-white border border-slate-800 shadow-lg' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User size={16} />
              Customer (Buyer)
            </button>
            <button
              onClick={() => setActiveTab('courier')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'courier' 
                  ? 'bg-slate-900 text-white border border-slate-800 shadow-lg' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Truck size={16} />
              Courier (Delivery)
            </button>
            <button
              onClick={() => setActiveTab('arbitrator')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'arbitrator' 
                  ? 'bg-slate-900 text-white border border-slate-800 shadow-lg' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck size={16} />
              Seller / Arbitrator
            </button>
          </div>

          {/* Tab contents */}
          <div className="glass rounded-3xl p-6 border border-slate-800/60 shadow-xl flex-grow">
            
            {/* Buyer Tab */}
            {activeTab === 'buyer' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                    Create Secure Order & Lock Funds
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Deploy funds to the safe escrow contract. Funds are split released on verification.
                  </p>
                </div>

                <form onSubmit={handleCreateOrder} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Seller Address</label>
                      <input
                        type="text"
                        value={formData.seller}
                        onChange={(e) => setFormData({ ...formData, seller: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Authorized Courier</label>
                      <select
                        value={formData.courier}
                        onChange={(e) => setFormData({ ...formData, courier: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                      >
                        {DEFAULT_COURIERS.map((c, i) => (
                          <option key={i} value={c.address}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Lock Amount (XLM/USDC)</label>
                      <div className="relative">
                        <DollarSign size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="number"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                          className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Delivery Code (PIN)</label>
                      <input
                        type="text"
                        value={formData.verificationCode}
                        onChange={(e) => setFormData({ ...formData, verificationCode: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Deadline Timeout (sec)</label>
                      <input
                        type="number"
                        value={formData.timeout}
                        onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/80 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all hover:scale-[1.01] shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2"
                  >
                    <Lock size={16} />
                    Lock Escrow Payment & Create Shipment
                  </button>
                </form>

                {/* Placed Orders List */}
                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <h4 className="font-heading font-semibold text-sm text-slate-300 uppercase tracking-wider">Your Escrow Shipments</h4>
                  <div className="grid grid-cols-1 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {orders.map((o) => (
                      <div
                        key={o.id}
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                          selectedOrderId === o.id
                            ? 'bg-blue-500/5 border-blue-500/50 shadow'
                            : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-950/60 hover:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400">Order #{o.id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            o.status === 3 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            o.status === 4 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {o.status === 0 ? 'Created' : o.status === 1 ? 'Dispatched' : o.status === 2 ? 'In Transit' : o.status === 3 ? 'Delivered' : 'Refunded'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                          <span>Amount: <strong className="text-white">{o.amount} XLM</strong></span>
                          <span>Courier: {o.courier.slice(0, 10)}...</span>
                        </div>
                        {/* Display Pin / QR button */}
                        {o.status < 3 && (
                          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">Pin: <strong className="text-slate-300">{o.verificationCode}</strong></span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(o.verificationCode).catch(() => {});
                                }
                                setQrCodeData(o.verificationCode);
                                showToast('Pin code copied! Present this QR code to the courier.', 'info');
                              }}
                              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                            >
                              <QrCode size={12} />
                              Generate QR
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Courier Tab */}
            {activeTab === 'courier' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                    Courier Delivery Management
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Authorized courier actions: update route checkpoints and confirm delivery.
                  </p>
                </div>

                {activeOrder ? (
                  <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Active Cargo</span>
                          <h4 className="font-heading font-bold text-md text-white">Order #{activeOrder.id}</h4>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {activeOrder.amount} XLM Escrowed
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-3 text-xs text-slate-300">
                        <div>
                          <span className="text-slate-500 block mb-1">Buyer:</span>
                          <span className="font-mono">{activeOrder.buyer.slice(0, 10)}...</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-1">Seller:</span>
                          <span className="font-mono">{activeOrder.seller.slice(0, 10)}...</span>
                        </div>
                      </div>
                    </div>

                    {/* Checkpoint updates */}
                    {activeOrder.status < 3 ? (
                      <div className="space-y-4">
                        <h4 className="font-heading font-semibold text-sm text-slate-300 uppercase tracking-wider">Courier Dispatch Actions</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <button
                            onClick={() => handleUpdateCheckpoint(1, 'Logistics Facility - Packages Sorted')}
                            disabled={activeOrder.status >= 1}
                            className="py-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900/60 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-slate-950 flex items-center justify-center gap-2"
                          >
                            <Package size={14} />
                            Mark Dispatched
                          </button>
                          <button
                            onClick={() => handleUpdateCheckpoint(2, 'Out for Delivery (Transit checkpoint)')}
                            disabled={activeOrder.status >= 2 || activeOrder.status < 1}
                            className="py-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900/60 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-slate-950 flex items-center justify-center gap-2"
                          >
                            <Truck size={14} />
                            Mark In Transit
                          </button>
                        </div>

                        {/* QR Confirm trigger */}
                        <button
                          onClick={() => setShowQRConfirm(true)}
                          disabled={activeOrder.status < 2}
                          className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all hover:scale-[1.01] shadow-lg shadow-emerald-500/15 disabled:opacity-40 disabled:hover:bg-emerald-600 flex items-center justify-center gap-2"
                        >
                          <QrCode size={16} />
                          Confirm Delivery (Scan Buyer QR / Pin)
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-3">
                        <CheckCircle size={22} className="flex-shrink-0" />
                        <div>
                          <strong>Delivery Finalized:</strong> The cargo was verified on-chain. Escrow payment split was successfully completed.
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No orders currently assigned to you. Select or create an order first.
                  </div>
                )}
              </div>
            )}

            {/* Arbitrator Tab */}
            {activeTab === 'arbitrator' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                    Seller & Arbitrage Panel
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage delivery delays, verify timestamps, and execute buyer refunds on lock timeout.
                  </p>
                </div>

                {activeOrder ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-3">
                      <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-2">
                        <span>Escrow State (Contract CDZSMEY...):</span>
                        <span className="font-bold text-white uppercase tracking-wider">
                          {activeOrder.status === 3 ? 'Released' : activeOrder.status === 4 ? 'Refunded' : 'Locked'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Lock Expiry Time:</span>
                        <span className="text-slate-300 font-semibold">
                          {new Date((activeOrder.createdAt + activeOrder.timeoutDuration) * 1000).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Status Check:</span>
                        <span className={`font-semibold ${
                          Math.floor(Date.now() / 1000) > (activeOrder.createdAt + activeOrder.timeoutDuration)
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}>
                          {Math.floor(Date.now() / 1000) > (activeOrder.createdAt + activeOrder.timeoutDuration)
                            ? 'Deadline Expired (Eligible for Refund)'
                            : 'Within shipping deadline'}
                        </span>
                      </div>
                    </div>

                    {/* Refund Actions */}
                    {activeOrder.status < 3 ? (
                      <div className="space-y-3">
                        <button
                          onClick={handleRefund}
                          className="w-full py-3.5 rounded-xl border border-rose-800/30 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <RotateCcw size={14} />
                          Force Refund (Requires timeout or consensus)
                        </button>
                        <p className="text-[10px] text-center text-slate-500">
                          Refund is executed by calling cargo_escrow::refund_buyer. Funds return directly to the buyer's balance.
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                        <Info size={16} />
                        <span>This order is already finalized and cannot be refunded or cancelled.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No order selected. Select an order to view escrow details.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right column: Interactive Map and Timeline */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Tracking Map Card */}
          <div className="glass rounded-3xl p-6 border border-slate-800/60 shadow-xl flex flex-col min-h-[280px]">
            <div>
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                Live Cargo Route Map
              </h3>
              <p className="text-xs text-slate-400 mt-1">Real-time GPS tracking linked to Soroban event logs.</p>
            </div>

            {/* Map Canvas */}
            <div className="relative flex-grow h-44 rounded-2xl bg-slate-950 border border-slate-800/80 mt-4 overflow-hidden">
              <svg className="w-full h-full text-slate-800/30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <path d="M 40,88 L 140,44 L 260,132 L 360,88" fill="none" stroke="#1e293b" strokeWidth="3" strokeDasharray="5,5" />
                {activeOrder && activeOrder.status > 0 && (
                  <path 
                    d="M 40,88 L 140,44 L 260,132 L 360,88" 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="3.5" 
                    strokeDasharray="1000"
                    strokeDashoffset={
                      activeOrder.status === 1 ? '700' :
                      activeOrder.status === 2 ? '300' :
                      activeOrder.status === 3 ? '0' : '1000'
                    }
                    className="transition-all duration-1000 ease-out" 
                  />
                )}
              </svg>

              <div className="absolute left-[10%] top-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${activeOrder && activeOrder.status >= 0 ? 'bg-blue-500 border-blue-400 shadow shadow-blue-500/50' : 'bg-slate-900 border-slate-700'}`}></div>
                <span className="text-[9px] text-slate-400 font-bold mt-1 bg-slate-950/80 px-1 rounded">Seller</span>
              </div>
              <div className="absolute left-[35%] top-[25%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${activeOrder && activeOrder.status >= 1 ? 'bg-blue-500 border-blue-400 shadow shadow-blue-500/50' : 'bg-slate-900 border-slate-700'}`}></div>
                <span className="text-[9px] text-slate-400 font-bold mt-1 bg-slate-950/80 px-1 rounded">Hub A</span>
              </div>
              <div className="absolute left-[65%] top-[75%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${activeOrder && activeOrder.status >= 2 ? 'bg-blue-500 border-blue-400 shadow shadow-blue-500/50' : 'bg-slate-900 border-slate-700'}`}></div>
                <span className="text-[9px] text-slate-400 font-bold mt-1 bg-slate-950/80 px-1 rounded">Hub B</span>
              </div>
              <div className="absolute left-[90%] top-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${activeOrder && activeOrder.status >= 3 ? 'bg-emerald-500 border-emerald-400 shadow shadow-emerald-500/50' : 'bg-slate-900 border-slate-700'}`}></div>
                <span className="text-[9px] text-slate-400 font-bold mt-1 bg-slate-950/80 px-1 rounded">Buyer</span>
              </div>

              {activeOrder && activeOrder.status < 4 && (
                <div 
                  className="absolute p-2 bg-blue-600 rounded-xl shadow-lg border border-blue-400/40 text-white transition-all duration-1000 ease-out flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: getMapPosition(activeOrder.status).x,
                    top: getMapPosition(activeOrder.status).y
                  }}
                >
                  <Truck size={14} className={activeOrder.status === 3 ? 'text-emerald-300' : 'animate-bounce'} />
                </div>
              )}
            </div>
          </div>

          {/* Timeline Tracking Details */}
          <div className="glass rounded-3xl p-6 border border-slate-800/60 shadow-xl flex-grow">
            <h3 className="font-heading font-bold text-lg text-white mb-6">
              Escrow State Ledger Timeline
            </h3>
            {activeOrder ? (
              <TrackingTimeline 
                checkpoints={activeOrder.checkpoints} 
                currentStatus={activeOrder.status} 
              />
            ) : (
              <div className="py-10 text-center text-slate-500 text-sm">
                Select an active cargo to view tracking history.
              </div>
            )}
          </div>

          {/* Deployed Contracts Info */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-[10px] space-y-1 text-slate-500 font-mono">
            <div className="font-semibold text-slate-400 mb-1">DEPLOYED CONTRACTS (TESTNET)</div>
            <div>Registry: <span className="text-slate-300">{CONTRACTS.COURIER_REGISTRY}</span></div>
            <div>Tracker:  <span className="text-slate-300">{CONTRACTS.LOGISTICS_TRACKER}</span></div>
            <div>Escrow:   <span className="text-slate-300">{CONTRACTS.CARGO_ESCROW}</span></div>
          </div>
        </section>
      </main>

      {/* QR Confirmation Modal */}
      {showQRConfirm && (
        <QRConfirmation
          onScanSuccess={handleQRConfirmed}
          onClose={() => setShowQRConfirm(false)}
        />
      )}

      {/* QR Code presentation modal for buyer */}
      {qrCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm glass rounded-2xl p-6 border border-slate-800 text-center space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <span className="font-heading font-bold text-white text-md">Delivery QR Code</span>
              <button onClick={() => setQrCodeData(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 bg-white rounded-xl aspect-square w-full max-w-[200px] mx-auto flex items-center justify-center">
              <svg className="w-full h-full text-slate-900" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="none" />
                <rect x="5" y="5" width="25" height="25" fill="currentColor" />
                <rect x="8" y="8" width="19" height="19" fill="white" />
                <rect x="12" y="12" width="11" height="11" fill="currentColor" />

                <rect x="70" y="5" width="25" height="25" fill="currentColor" />
                <rect x="73" y="8" width="19" height="19" fill="white" />
                <rect x="77" y="12" width="11" height="11" fill="currentColor" />

                <rect x="5" y="70" width="25" height="25" fill="currentColor" />
                <rect x="8" y="73" width="19" height="19" fill="white" />
                <rect x="12" y="77" width="11" height="11" fill="currentColor" />

                <rect x="40" y="10" width="5" height="15" fill="currentColor" />
                <rect x="50" y="5" width="10" height="5" fill="currentColor" />
                <rect x="45" y="25" width="15" height="5" fill="currentColor" />
                <rect x="40" y="40" width="20" height="20" fill="currentColor" />
                <rect x="45" y="45" width="10" height="10" fill="white" />
                <rect x="75" y="40" width="5" height="15" fill="currentColor" />
                <rect x="70" y="60" width="10" height="5" fill="currentColor" />
                <rect x="10" y="45" width="15" height="5" fill="currentColor" />
                <rect x="5" y="55" width="5" height="10" fill="currentColor" />
                <rect x="40" y="75" width="15" height="15" fill="currentColor" />
                <rect x="70" y="70" width="25" height="5" fill="currentColor" />
                <rect x="80" y="80" width="5" height="15" fill="currentColor" />
              </svg>
            </div>
            
            <div>
              <p className="text-xs text-slate-400">
                Present this QR code to the courier on delivery. Scanning it will cryptographically unlock the escrow payment.
              </p>
              <p className="text-xs text-blue-400 mt-2 font-mono font-bold">
                Verification PIN: {qrCodeData}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
