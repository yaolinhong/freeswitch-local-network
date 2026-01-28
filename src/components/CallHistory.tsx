import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

interface Call {
    id: string;
    caller: { displayName: string; extension: string };
    callee: { displayName: string; extension: string };
    startTime: string;
    duration: number;
    status: string;
    recordingUrl?: string;
}

export const CallHistory = () => {
    const { user } = useAuthStore();
    const [calls, setCalls] = useState<Call[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCalls = async () => {
        if (!user) return;
        try {
            const res = await api.get<{ calls: Call[] }>(`/calls?userId=${user.id}`);
            setCalls(res.calls);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalls();
        const interval = setInterval(fetchCalls, 10000);
        return () => clearInterval(interval);
    }, [user]);

    if (loading) return <div>Loading history...</div>;

    return (
        <div className="bg-white rounded-lg shadow p-6 mt-8">
            <h2 className="text-xl font-bold mb-4">通话记录</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">主叫</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">被叫</th>
                            {/* <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时长</th> */}
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">录音</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {calls.map(call => (
                            <tr key={call.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(call.startTime).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {call.caller.displayName} ({call.caller.extension})
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {call.callee.displayName} ({call.callee.extension})
                                </td>
                                {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {call.duration}s
                                </td> */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {call.recordingUrl ? (
                                        <div>
                                            <audio
                                                controls
                                                src={call.recordingUrl}
                                                className="h-10 w-48"
                                                preload="metadata"
                                            />
                                            <a
                                                href={call.recordingUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-gray-500 hover:underline ml-2"
                                                download
                                            >
                                                下载
                                            </a>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {calls.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">暂无通话记录</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
