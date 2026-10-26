import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Appointments from './pages/Appointments.jsx';
import Billing from './pages/Billing.jsx';
import InvoiceNew from './pages/InvoiceNew.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Inventory from './pages/Inventory.jsx';
import Procedures from './pages/Procedures.jsx';
import Staff from './pages/Staff.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import AuditLog from './pages/AuditLog.jsx';
import PrescriptionPrint from './pages/PrescriptionPrint.jsx';

function RequireRole({ roles, children }) {
  const { can } = useAuth();
  if (!can(...roles)) {
    return (
      <div className="card p-10 text-center">
        <p className="font-semibold">You don&apos;t have access to this page.</p>
        <p className="mt-1 text-sm text-slate-500">Ask an administrator if you need it.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/prescriptions/:id/print" element={<PrescriptionPrint />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="billing" element={<Billing />} />
        <Route path="billing/new" element={<RequireRole roles={['receptionist', 'accountant']}><InvoiceNew /></RequireRole>} />
        <Route path="billing/:id" element={<InvoiceDetail />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="procedures" element={<Procedures />} />
        <Route path="reports" element={<RequireRole roles={['accountant']}><Reports /></RequireRole>} />
        <Route path="staff" element={<RequireRole roles={[]}><Staff /></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={[]}><AuditLog /></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={[]}><Settings /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
