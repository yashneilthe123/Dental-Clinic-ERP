import { useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useApi } from '../lib/hooks.js';
import { fmtDateTime } from '../lib/format.js';
import { Badge, Card, Empty, Loading, PageHeader, Select } from '../components/ui.jsx';

const ENTITIES = ['patient', 'appointment', 'treatment', 'prescription', 'invoice', 'inventory_item', 'procedure', 'user', 'settings'];

export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const { data, loading } = useApi(() => api.get(`/audit${qs({ entity })}`), [entity]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who viewed or changed what. The latest 300 events."
        actions={
          <Select className="w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All records</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </Select>
        } />
      <Card>
        {loading ? <Loading /> : data.length === 0 ? <Empty title="No events" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</td>
                    <td className="font-medium">{a.user_name || '—'}</td>
                    <td><Badge color={a.action === 'view' ? 'gray' : a.action.includes('delete') || a.action === 'void' ? 'red' : 'teal'}>{a.action}</Badge></td>
                    <td className="text-slate-600">{a.entity} #{a.entity_id}</td>
                    <td className="max-w-xs truncate font-mono text-xs text-slate-500">{a.details ? JSON.stringify(a.details) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
