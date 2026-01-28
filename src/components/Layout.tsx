import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LogOut, User } from 'lucide-react';

export const Layout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 ">
            <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center text-white font-bold">
              V
            </div>
            <span className="text-xl font-bold text-gray-900">VoIP System</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.displayName}</p>
                <p className="text-xs text-gray-500">Ext: {user?.extension}</p>
              </div>
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                <User size={20} />
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-600 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
};
