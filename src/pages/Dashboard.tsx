import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { useCallStore } from '../store/useCallStore';
import { Phone, RefreshCw, Volume2, ShieldCheck, PhoneOff } from 'lucide-react';
import { AudioVisualizer } from '../components/AudioVisualizer';
import { CallHistory } from '../components/CallHistory';

interface User {
  id: string;
  username: string;
  extension: string;
  displayName: string;
  status: string;
}

export const Dashboard = () => {
  const { user } = useAuthStore();
  const { initializeSip, makeCall, hangupCall, answerCall, rejectCall, status: sipStatus, remoteStream, remoteIdentity } = useCallStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [callHistoryKey, setCallHistoryKey] = useState(0);

  const fetchUsers = async () => {
    try {
      const { users } = await api.get<{ users: User[] }>('/users');
      setUsers(users.filter(u => u.id !== user?.id));
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const refreshCallHistory = () => {
    // Force refresh CallHistory by incrementing key
    setCallHistoryKey(prev => prev + 1);
    console.log('[Dashboard] Call history refreshed');
  };

  useEffect(() => {
    fetchUsers();
    // Poll for user status updates every 30 seconds
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Auto-refresh call history when call ends
  const previousStatus = React.useRef<string>(sipStatus);
  useEffect(() => {
    const wasInCall = ['calling', 'incoming', 'answering', 'connected'].includes(previousStatus.current);
    const isNowRegistered = sipStatus === 'registered';

    if (wasInCall && isNowRegistered) {
      // Call just ended, refresh call history
      console.log('[Dashboard] Call ended, refreshing history...');
      // Wait a moment for backend to process recording
      setTimeout(() => {
        refreshCallHistory();
      }, 1000);
    }

    previousStatus.current = sipStatus;
  }, [sipStatus]);

  useEffect(() => {
    if (user?.id) {
        const newStatus = sipStatus === 'registered' ? 'online' : 'offline';
        // Only update if status changed locally or we want to sync
        // But here we just sync on sipStatus change
        api.put('/users/status', { userId: user.id, status: newStatus })
           .catch(err => console.error('Failed to update status', err));
    }
  }, [sipStatus, user?.id]);

  useEffect(() => {
    if (user && user.extension) {
        // Initialize SIP when user is logged in
        // In a real app, WSS URL and domain should come from config
        initializeSip({
            extension: user.extension,
            domain: window.location.hostname, // Assuming local setup
            wssServer: `wss://${window.location.host}/sip-ws`, // Proxy to WS 5066
            username: user.extension, // SIP username is usually the extension
            password: '1234SecurePassword' // Fixed password
        });
    }
  }, [user, initializeSip]);

  const handleCall = (extension: string) => {
      makeCall(extension);
  };

  const handleTestAudio = () => {
    // Use a short beep using Web Audio API which is more reliable for testing
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1);
        osc.stop(ctx.currentTime + 1);
        console.log('Testing audio via Web Audio API');
    } catch (e) {
        console.error('Audio test failed', e);
        alert('Audio API not supported or failed: ' + e);
    }
  };

  const handleAcceptCert = () => {
    // Open FS WSS port in new tab to accept self-signed cert
    window.open(`https://${window.location.hostname}:8443`, '_blank');
  };

  // Check if in call state
  const isInCall = sipStatus === 'calling' || sipStatus === 'incoming' || sipStatus === 'answering' || sipStatus === 'connected';
  const isIncomingCall = sipStatus === 'incoming' || sipStatus === 'answering';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Active Call Screen */}
      {isInCall && (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-600 to-gray-800 z-50 flex flex-col items-center justify-center text-white">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center text-white text-4xl font-bold mb-4 mx-auto">
              {remoteIdentity?.[0] || '?'}
            </div>
            <h2 className="text-3xl font-semibold mb-2">{remoteIdentity || 'Unknown'}</h2>
            <p className="text-gray-200 text-lg">
              {sipStatus === 'calling' && '正在呼叫...'}
              {sipStatus === 'incoming' && '来电'}
              {sipStatus === 'answering' && '正在接听...'}
              {sipStatus === 'connected' && '通话中'}
            </p>
          </div>

          {/* Audio Visualizer */}
          {remoteStream && (
            <div className="bg-white/10 rounded-lg p-4 mb-8">
              <AudioVisualizer stream={remoteStream} />
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center gap-6">
            {isIncomingCall ? (
              <>
                <button
                  onClick={answerCall}
                  disabled={sipStatus === 'answering'}
                  className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  <Phone size={32} />
                </button>
                <button
                  onClick={rejectCall}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                >
                  <PhoneOff size={32} />
                </button>
              </>
            ) : (
              <button
                onClick={hangupCall}
                className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
              >
                <PhoneOff size={32} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Dashboard */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
        <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-gray-800">联系人</h1>
        </div>
        <div className="flex items-center gap-4 justify-end">
          <button
                onClick={handleAcceptCert}
                className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm hover:bg-yellow-200 flex items-center gap-1"
                title="Accept FreeSWITCH Certificate"
            >
                <ShieldCheck size={16} /> Cert
            </button>
            {/* <button
                onClick={handleAcceptCert}
                className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm hover:bg-yellow-200 flex items-center gap-1"
                title="Accept FreeSWITCH Certificate"
            >
                <ShieldCheck size={16} /> Cert
            </button>
            <button
                onClick={handleTestAudio}
                className="px-3 py-1 bg-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-300 flex items-center gap-1"
            >
                <Volume2 size={16} /> Test Audio
            </button> */}
            <span className={`px-3 py-1 rounded-full text-sm ${
                sipStatus === 'registered' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
                SIP: {sipStatus}
            </span>
            <button 
                onClick={fetchUsers}
                className="p-2 text-gray-600 hover:text-gray-600 transition-colors"
            >
                <RefreshCw size={20} />
            </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading users...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-lg">
                  {u.displayName[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{u.displayName}</h3>
                  <p className="text-sm text-gray-500">Ext: {u.extension}</p>
                  <span className={`text-xs ${
                    u.status === 'online' ? 'text-green-500' : 'text-gray-400'
                  }`}>
                    ● {u.status}
                  </span>
                </div>
              </div>
              
              <button
                onClick={() => handleCall(u.extension)}
                disabled={sipStatus !== 'registered' || u.status !== 'online'}
                className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Phone size={20} />
              </button>
            </div>
          ))}
          
          {users.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500">
              No other users found. Open another browser window to register a new user!
            </div>
          )}
        </div>
      )}
      
      <CallHistory key={callHistoryKey} />
    </div>
  );
};
