import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-emerald-600">📅 School Scheduler</span>
        </div>
        <div className="flex gap-4">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn btn-primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">
                Sign In
              </Link>
              <Link to="/register" className="btn btn-primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="px-6 py-16 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              School scheduling
              <span className="text-emerald-600"> solved in seconds</span>
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              Stop wrestling with spreadsheets. Our constraint-based algorithm generates
              optimal schedules for your entire school — 500 students, 80 courses,
              3,500 assignments — in under a second.
            </p>
            <div className="flex gap-4">
              <Link to="/register" className="btn btn-primary text-lg px-6 py-3">
                Start Free Trial
              </Link>
              <a href="#features" className="btn btn-secondary text-lg px-6 py-3">
                Learn More
              </a>
            </div>
          </div>
          <div className="animate-fade-in">
            <img
              src="/images/hero.png"
              alt="Schedule visualization"
              className="w-full max-w-md mx-auto drop-shadow-xl"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 mt-20 py-8 border-y border-slate-200">
          <div className="text-center">
            <div className="stat-value text-emerald-600">98%</div>
            <div className="stat-label">Schedule Score</div>
          </div>
          <div className="text-center">
            <div className="stat-value text-emerald-600">&lt;1s</div>
            <div className="stat-label">Generation Time</div>
          </div>
          <div className="text-center">
            <div className="stat-value text-emerald-600">0</div>
            <div className="stat-label">Hard Violations</div>
          </div>
        </div>

        {/* Features */}
        <section id="features" className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card text-center">
              <img src="/images/students.png" alt="Students" className="w-24 h-24 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">1. Enter Your Data</h3>
              <p className="text-slate-600">
                Import students, teachers, courses, and rooms. Set requirements and preferences.
              </p>
            </div>
            <div className="card text-center">
              <img src="/images/loading.png" alt="Processing" className="w-24 h-24 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">2. Generate Schedule</h3>
              <p className="text-slate-600">
                Our ILP algorithm finds the optimal assignment satisfying all constraints.
              </p>
            </div>
            <div className="card text-center">
              <img src="/images/schedule.png" alt="Schedule" className="w-24 h-24 mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">3. Review & Export</h3>
              <p className="text-slate-600">
                View the master schedule, check for conflicts, export to your SIS.
              </p>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="mt-20 card bg-slate-900 text-white">
          <h2 className="text-2xl font-bold mb-6">The Problem We Solve</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-emerald-400 mb-2">Manual Scheduling Pain</h3>
              <ul className="space-y-2 text-slate-300">
                <li>• 500 students × 7 periods = 3,500 assignments</li>
                <li>• Each must satisfy 10+ constraints</li>
                <li>• One change cascades everywhere</li>
                <li>• Weeks of spreadsheet wrestling</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-emerald-400 mb-2">With School Scheduler</h3>
              <ul className="space-y-2 text-slate-300">
                <li>✓ All constraints handled automatically</li>
                <li>✓ Optimal section balancing</li>
                <li>✓ Grade-aware conflict prevention</li>
                <li>✓ Results in under 1 second</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 mt-20 border-t border-slate-200">
        <div className="max-w-6xl mx-auto text-center text-slate-500">
          <p>© 2024 School Scheduler. Built with ❤️ and Claude Code.</p>
        </div>
      </footer>
    </div>
  );
}
