import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import type { PerformanceData, PerformancePerson, SlaCounts } from '../types/performance';
import './Performance.css';
const emptyFilters = { departmentId: '', type: 'ALL', fromDate: '', toDate: '', search: '' };
function Score({ value }: { value: number | null }) {
  if (value === null) return <span title="No eligible measurable checkpoints">N/A</span>;
  return <span className={`performance-score score-${value >= 90 ? 'high' : value >= 75 ? 'middle' : value >= 50 ? 'low' : 'lowest'}`}>{value.toFixed(1)}%</span>;
}
function timestamp(value: number | null) {
  return value === null ? 'N/A' : new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }).format(value);
}
function Breakdown({ title, counts }: { title: string; counts: SlaCounts }) {
  return <section className="sla-breakdown"><h3>{title}</h3><p>Eligible: {counts.eligible} | On Time: {counts.onTime} | Delayed: {counts.delayed} | Not Due: {counts.notDue} | Unknown: {counts.unknown}</p></section>;
}
export default function Performance() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<PerformancePerson | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(''); setSelected(null);
      api.get('/performance', { signal: controller.signal, params: Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== '')) })
        .then(response => setData(response.data.data))
        .catch(cause => {
          if (axios.isCancel(cause)) return;
          if (axios.isAxiosError(cause) && cause.response?.status === 401) navigate('/', { replace: true });
          else if (axios.isAxiosError(cause) && cause.response?.status === 403) navigate('/tasks', { replace: true });
          else setError(axios.isAxiosError(cause) ? cause.response?.data?.message || 'Unable to load performance.' : 'Unable to load performance.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, retry, navigate]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  const change = (key: keyof typeof emptyFilters, value: string) => setFilters(old => ({ ...old, [key]: value }));
  const renderTable = (kind: 'EMPLOYEE' | 'EA') => {
    const people = data?.people.filter(p => p.kind === kind) || [];
    const headers = kind === 'EMPLOYEE'
      ? ['Employee', 'Department', 'Total Assigned', 'Eligible Tasks', 'On Time', 'Delayed', 'Not Due', 'Score', 'Action']
      : ['EA', 'Delegations', 'Assignment Eligible', 'Assignment On Time', 'Assignment Delayed', 'Outcome Eligible', 'Outcome On Time', 'Outcome Delayed', 'Not Due', 'Score', 'Action'];
    return <section className="performance-table-card" aria-labelledby={`performance-${kind}`}>
      <h2 id={`performance-${kind}`}>{kind === 'EMPLOYEE' ? 'Employee Performance' : 'EA Performance'}</h2>
      <div className="performance-table-scroll" tabIndex={0} aria-label={`${kind} performance table`}><table>
        <thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{people.length === 0 ? <tr><td colSpan={headers.length}>No people match the selected filters.</td></tr> : people.map(p => <tr key={p.id}>
          <td>{p.name}</td>{kind === 'EMPLOYEE' && <td>{p.departmentName || '-'}</td>}<td>{p.assigned}</td>
          {kind === 'EA' && <><td>{p.assignment.eligible}</td><td>{p.assignment.onTime}</td><td>{p.assignment.delayed}</td></>}
          <td>{p.outcome.eligible}</td><td>{p.outcome.onTime}</td><td>{p.outcome.delayed}</td>
          <td title={kind === 'EA' ? 'Assignment plus outcome checkpoints not yet due' : undefined}>{p.outcome.notDue + p.assignment.notDue}</td>
          <td><Score value={p.score} />{p.outcome.unknown + p.assignment.unknown > 0 && <small>{p.outcome.unknown + p.assignment.unknown} unknown; excluded</small>}</td>
          <td><button onClick={() => setSelected(p)}>View Details</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>;
  };
  return <div className="performance-page">
    <h1>Performance &amp; Scoring</h1>
    <div className="performance-filters">
      <label>Department<select value={filters.departmentId} onChange={e => change('departmentId', e.target.value)}><option value="">All Departments</option>{data?.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Performance Type<select value={filters.type} onChange={e => change('type', e.target.value)}><option value="ALL">All</option><option value="EMPLOYEE">Employee</option><option value="EA">EA</option></select></label>
      <label>From Date<input type="date" value={filters.fromDate} onChange={e => change('fromDate', e.target.value)} /></label>
      <label>To Date<input type="date" min={filters.fromDate || undefined} value={filters.toDate} onChange={e => change('toDate', e.target.value)} /></label>
      <label>Search<input type="search" maxLength={191} placeholder="Employee / EA name" value={filters.search} onChange={e => change('search', e.target.value)} /></label>
      <button onClick={() => setFilters({ ...emptyFilters })}>Clear Filters</button>
    </div>
    {error && <p className="performance-error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {loading ? <p role="status">Loading performance...</p> : !error && data && <>
      <div className="performance-stats">{[['People', data.summary.totalPeople], ['Delegations', data.summary.totalDelegations], ['On Time', data.summary.onTime], ['Delayed', data.summary.delayed]].map(([label, value]) => <div key={label} className="task-stat"><span>{label}</span><strong>{value}</strong></div>)}</div>
      
      {filters.type !== 'EA' && renderTable('EMPLOYEE')}
      {filters.type !== 'EMPLOYEE' && renderTable('EA')}
      <details className="performance-method"><summary>How scoring works</summary>
        <p>Employee Score = on-time eligible tasks / eligible tasks x 100. EA Score = (on-time assignments + on-time outcomes) / (eligible assignments + eligible outcomes) x 100. Zero eligible checkpoints means N/A.</p>
        <p>Assignment deadline is creation time plus exactly 2 elapsed hours, including nights and weekends. Assignment at the deadline is on time. An unassigned delegation becomes delayed only after that deadline.</p>
        <p>Task deadline is 23:59:59.999 India time on the latest approved target date. Completed work is evaluated immediately. Open work is not due until the deadline passes, then delayed/overdue. Pending or Delayed application status alone does not determine performance. Target revisions carry no extra penalty.</p>
        <p>Missing or invalid required timestamps are Unknown and excluded from the denominator. Details show this coverage. Assignment belongs to the assigned EA regardless of which authorized manager performed it. Inactive people remain included for historical fairness.</p>
      </details>
    </>}
    <dialog ref={dialog} className="performance-dialog" aria-labelledby="performance-detail-title" onCancel={() => setSelected(null)}>
      {selected && <><h2 id="performance-detail-title">{selected.name}</h2><p>Total {selected.kind === 'EA' ? 'delegations' : 'assigned'}: {selected.assigned}</p>
        {selected.kind === 'EA' && <Breakdown title="Assignment SLA - 2 hours" counts={selected.assignment} />}
        <Breakdown title="Task Outcome SLA - target end-of-day" counts={selected.outcome} />
        <p>Open overdue: {selected.outcome.overdue}. Unknown checkpoints have missing or invalid evidence and are excluded.</p>
        <p className="sla-formula">Score: {selected.onTime} / {selected.eligible} x 100 = <Score value={selected.score} /></p>
        <p>All timestamps below are India time. Target deadlines include the final millisecond of the day.</p>
        <div className="performance-detail-scroll"><table><thead><tr><th>Delegation</th>{selected.kind === 'EA' && <><th>Assignment Deadline</th><th>Actual Assignment</th><th>Assignment Result</th></>}<th>Target Date</th><th>Completed At</th><th>Outcome</th></tr></thead>
          <tbody>{selected.details.map(d => <tr key={d.id}><td>#{d.id}</td>{selected.kind === 'EA' && <><td>{timestamp(d.assignmentDeadline)}</td><td>{timestamp(d.actualAssignment)}<small>{d.assignmentSource || 'No reliable assignment timestamp'}</small></td><td>{d.assignment}</td></>}<td>{d.targetDate || 'N/A'}<small>23:59:59.999 IST</small></td><td>{timestamp(d.completedAt)}</td><td>{d.overdue ? 'DELAYED / OVERDUE' : d.outcome}</td></tr>)}</tbody>
        </table></div><button onClick={() => setSelected(null)}>Close</button></>}
    </dialog>
  </div>;
}
