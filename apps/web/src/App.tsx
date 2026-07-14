import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { SignIn } from './screens/SignIn';
import { Dashboard } from './screens/Dashboard';
import { MyAppraisal } from './screens/MyAppraisal';
import { TeamReviews } from './screens/TeamReviews';
import { ReviewDetail } from './screens/ReviewDetail';
import { Templates } from './screens/Templates';
import { TemplateBuilder } from './screens/TemplateBuilder';
import { Cycles } from './screens/Cycles';
import { Notifications } from './screens/Notifications';
import { Organization } from './screens/Organization';
import { Analytics } from './screens/Analytics';
import { Security } from './screens/Security';
import { AuditLog } from './screens/AuditLog';
import { Gdpr } from './screens/Gdpr';
import { Users } from './screens/Users';

export function App() {
  const { me, loading } = useAuth();

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }} className="muted">Loading…</div>;
  if (!me) return <SignIn />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-appraisal" element={<MyAppraisal />} />
        <Route path="/reviews" element={<TeamReviews />} />
        <Route path="/reviews/:id" element={<ReviewDetail />} />
        <Route path="/organization" element={<Organization />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<TemplateBuilder />} />
        <Route path="/templates/new" element={<TemplateBuilder />} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/users" element={<Users />} />
        <Route path="/security" element={<Security />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/gdpr" element={<Gdpr />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
