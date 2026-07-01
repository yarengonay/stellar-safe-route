import React from 'react';
import { Package, Truck, MapPin, CheckCircle, Clock } from 'lucide-react';

export interface Checkpoint {
  status: number;
  location: string;
  timestamp: number;
}

interface TrackingTimelineProps {
  checkpoints: Checkpoint[];
  currentStatus: number;
}

const statusLabels = [
  'Order Created',
  'Dispatched / Picked Up',
  'In Transit',
  'Delivered',
  'Cancelled'
];

export const TrackingTimeline: React.FC<TrackingTimelineProps> = ({ checkpoints, currentStatus }) => {
  const getStatusIcon = (status: number, isActive: boolean) => {
    const colorClass = isActive ? 'text-blue-400 bg-blue-500/10 border-blue-500/50' : 'text-gray-500 bg-gray-500/5 border-gray-700/50';
    switch (status) {
      case 0:
        return <div className={`p-2 rounded-lg border ${colorClass}`}><Package size={20} /></div>;
      case 1:
        return <div className={`p-2 rounded-lg border ${colorClass}`}><Truck size={20} /></div>;
      case 2:
        return <div className={`p-2 rounded-lg border ${colorClass}`}><MapPin size={20} /></div>;
      case 3:
        return <div className={`p-2 rounded-lg border ${colorClass}`}><CheckCircle size={20} /></div>;
      default:
        return <div className={`p-2 rounded-lg border ${colorClass}`}><Clock size={20} /></div>;
    }
  };

  const formatDate = (timestamp: number) => {
    if (timestamp === 0) return 'Pending...';
    // Stellar ledger timestamps are in seconds, JS Date expects milliseconds
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="relative pl-6 border-l-2 border-slate-800/80 space-y-8 py-2">
      {checkpoints.map((cp, idx) => {
        const isActive = cp.status <= currentStatus;
        return (
          <div key={idx} className="relative group transition-all duration-300">
            {/* Dot Indicator */}
            <div className={`absolute -left-[35px] top-1.5 transition-transform duration-300 group-hover:scale-110`}>
              {getStatusIcon(cp.status, isActive)}
            </div>

            <div className="pl-4">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                isActive 
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}>
                {statusLabels[cp.status]}
              </span>
              <h4 className="font-heading font-semibold text-lg text-slate-100 mt-2">
                {cp.location}
              </h4>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <Clock size={12} className="text-slate-500" />
                {formatDate(cp.timestamp)}
              </p>
            </div>
          </div>
        );
      })}

      {/* Future steps placeholder */}
      {checkpoints.length < 4 && checkpoints[checkpoints.length - 1].status < 3 && (
        <div className="relative group opacity-50">
          <div className="absolute -left-[35px] top-1.5">
            <div className="p-2 rounded-lg border text-gray-600 bg-gray-600/5 border-gray-800/50">
              <Clock size={20} />
            </div>
          </div>
          <div className="pl-4">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-900 text-slate-600 border border-slate-800">
              Next Step: {statusLabels[checkpoints[checkpoints.length - 1].status + 1]}
            </span>
            <h4 className="font-heading font-semibold text-lg text-slate-500 mt-2">
              Waiting for dispatch / transit updates
            </h4>
            <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-1">
              <Clock size={12} />
              --:--
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
