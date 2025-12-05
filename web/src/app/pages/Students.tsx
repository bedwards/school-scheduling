import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function Students() {
  const { schoolId } = useParams<{ schoolId: string }>();
  return (
    <Layout schoolId={schoolId}>
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold mb-6">Students</h1>
        <div className="card">
          <p className="text-slate-600">Student management coming soon...</p>
          <img src="/images/students.png" alt="Students" className="w-48 mx-auto mt-4" />
        </div>
      </div>
    </Layout>
  );
}
