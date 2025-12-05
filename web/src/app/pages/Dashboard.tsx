import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, apiFetch } from '../context/AuthContext';

interface School {
  id: string;
  name: string;
  accessLevel: string;
  stats?: {
    students: number;
    teachers: number;
    courses: number;
    rooms: number;
  };
}

export default function Dashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const response = await apiFetch('/schools');
      const data = await response.json();
      if (data.success) {
        setSchools(data.data);
      }
    } catch (err) {
      console.error('Failed to load schools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const response = await apiFetch('/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newSchoolName }),
      });
      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        setNewSchoolName('');
        navigate(`/schools/${data.data.id}`);
      }
    } catch (err) {
      console.error('Failed to create school:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/dashboard" className="text-emerald-600 font-bold text-xl">
            📅 School Scheduler
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-slate-600">{user?.name}</span>
            <button onClick={handleLogout} className="btn btn-secondary text-sm">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Your Schools</h1>
            <p className="text-slate-600">Select a school or create a new one</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + New School
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <img src="/images/loading.png" alt="Loading" className="w-24 h-24 animate-pulse" />
          </div>
        ) : schools.length === 0 ? (
          <div className="card text-center py-12 animate-fade-in">
            <img src="/images/empty.png" alt="No schools" className="w-32 h-32 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No schools yet</h2>
            <p className="text-slate-600 mb-6">Create your first school to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create School
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schools.map((school) => (
              <Link
                key={school.id}
                to={`/schools/${school.id}`}
                className="card card-hover animate-fade-in"
              >
                <h3 className="font-semibold text-lg mb-2">{school.name}</h3>
                <span className="badge badge-info mb-4">{school.accessLevel}</span>
                {school.stats && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                    <div>
                      <div className="stat-value text-lg">{school.stats.students}</div>
                      <div className="stat-label">Students</div>
                    </div>
                    <div>
                      <div className="stat-value text-lg">{school.stats.teachers}</div>
                      <div className="stat-label">Teachers</div>
                    </div>
                    <div>
                      <div className="stat-value text-lg">{school.stats.courses}</div>
                      <div className="stat-label">Courses</div>
                    </div>
                    <div>
                      <div className="stat-value text-lg">{school.stats.rooms}</div>
                      <div className="stat-label">Rooms</div>
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-xl font-bold mb-4">Create New School</h2>
            <form onSubmit={handleCreateSchool}>
              <div className="mb-4">
                <label htmlFor="schoolName" className="label">
                  School Name
                </label>
                <input
                  id="schoolName"
                  type="text"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  className="input"
                  placeholder="Lincoln High School"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn btn-primary"
                >
                  {isCreating ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
