import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../context/AuthContext';
import Layout from '../components/Layout';

interface School {
  id: string;
  name: string;
  stats: {
    students: number;
    teachers: number;
    courses: number;
    rooms: number;
    activeSchedules: number;
  };
}

export default function SchoolDetail() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    try {
      const response = await apiFetch(`/schools/${schoolId}`);
      const data = await response.json();
      if (data.success) {
        setSchool(data.data);
      }
    } catch (err) {
      console.error('Failed to load school:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout schoolId={schoolId}>
        <div className="flex justify-center py-12">
          <img src="/images/loading.png" alt="Loading" className="w-24 h-24 animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!school) {
    return (
      <Layout>
        <div className="card text-center py-12">
          <img src="/images/error.png" alt="Error" className="w-24 h-24 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">School not found</h2>
        </div>
      </Layout>
    );
  }

  const navItems = [
    { to: `/schools/${schoolId}/students`, label: 'Students', count: school.stats.students, icon: '👤' },
    { to: `/schools/${schoolId}/teachers`, label: 'Teachers', count: school.stats.teachers, icon: '👨‍🏫' },
    { to: `/schools/${schoolId}/courses`, label: 'Courses', count: school.stats.courses, icon: '📚' },
    { to: `/schools/${schoolId}/rooms`, label: 'Rooms', count: school.stats.rooms, icon: '🏫' },
    { to: `/schools/${schoolId}/schedules`, label: 'Schedules', count: school.stats.activeSchedules, icon: '📅' },
  ];

  return (
    <Layout schoolId={schoolId} schoolName={school.name}>
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold mb-2">{school.name}</h1>
        <p className="text-slate-600 mb-8">Manage your school data and generate schedules</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="card card-hover flex items-center gap-4"
            >
              <div className="text-3xl">{item.icon}</div>
              <div className="flex-1">
                <div className="font-semibold text-lg">{item.label}</div>
                <div className="text-slate-500">{item.count} total</div>
              </div>
              <div className="text-slate-400">→</div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 card bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link
              to={`/schools/${schoolId}/schedules`}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              Generate Schedule
            </Link>
            <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">
              Import Data
            </button>
            <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">
              Export Report
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
