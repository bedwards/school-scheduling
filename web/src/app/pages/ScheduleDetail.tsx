import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function ScheduleDetail() {
  const { schoolId } = useParams<{ schoolId: string }>();
  return (
    <Layout schoolId={schoolId}>
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold mb-6">ScheduleDetail</h1>
        <div className="card">
          <p className="text-slate-600">ScheduleDetail management coming soon...</p>
        </div>
      </div>
    </Layout>
  );
}
