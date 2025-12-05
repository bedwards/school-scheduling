import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function Schedules() {
  const { schoolId } = useParams<{ schoolId: string }>();
  return (
    <Layout schoolId={schoolId}>
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold mb-6">Schedules</h1>
        <div className="card">
          <p className="text-slate-600">Schedules management coming soon...</p>
        </div>
      </div>
    </Layout>
  );
}
