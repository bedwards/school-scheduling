import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  schoolId?: string;
  schoolName?: string;
}

export default function Layout({ children, schoolId, schoolName }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const navItems = schoolId
    ? [
        { to: `/schools/${schoolId}`, label: 'Overview' },
        { to: `/schools/${schoolId}/students`, label: 'Students' },
        { to: `/schools/${schoolId}/teachers`, label: 'Teachers' },
        { to: `/schools/${schoolId}/courses`, label: 'Courses' },
        { to: `/schools/${schoolId}/rooms`, label: 'Rooms' },
        { to: `/schools/${schoolId}/schedules`, label: 'Schedules' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-emerald-600 font-bold text-xl">
              📅 School Scheduler
            </Link>
            {schoolName && (
              <>
                <span className="text-slate-300">/</span>
                <span className="text-slate-600">{schoolName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-600">{user?.name}</span>
            <button onClick={handleLogout} className="btn btn-secondary text-sm">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Sub-navigation */}
      {navItems.length > 0 && (
        <nav className="bg-white border-b border-slate-200 px-6">
          <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-link whitespace-nowrap ${
                  location.pathname === item.to ? 'nav-link-active' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
