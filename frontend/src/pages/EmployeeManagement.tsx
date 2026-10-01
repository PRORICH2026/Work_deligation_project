import { useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../services/api";
import "./EmployeeManagement.css";

type Employee = { id: number; employeeCode: string; fullName: string; departmentName: string; loginEmail: string; userId: number | null; isActive: boolean | number };
type Department = { id: number; name: string };
export default function EmployeeManagement() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [revision, refresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState<"add" | Employee | null>(null);
  const [modalError, setModalError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  function errorMessage(cause: unknown): string {
    if (axios.isAxiosError(cause)) {
      if (cause.response?.status === 401) window.location.assign("/");
      if (cause.response?.status === 403) window.location.assign("/tasks");
      return cause.response?.data?.message || "Unable to complete request. Please try again.";
    }
    return "Unable to complete request. Please try again.";
  }
  useEffect(() => {
    const controller = new AbortController();
    api.get("/departments", { signal: controller.signal }).then(r => { setDepartments(r.data.data); setDepartmentError(""); })
      .catch(e => { if (!axios.isCancel(e)) setDepartmentError("Unable to load departments. Please retry."); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      api.get("/employees/management", { signal: controller.signal, params: { search: search || undefined, departmentId: departmentId || undefined, status: status || undefined } })
        .then(r => setRows(r.data.data))
        .catch(e => { if (!axios.isCancel(e)) { setRows([]); setError(errorMessage(e)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, departmentId, status, revision]);
  useEffect(() => { if (modal) dialog.current?.showModal(); else dialog.current?.close(); }, [modal]);
  function open(value: "add" | Employee) { setModalError(""); setSuccess(""); setModal(value); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || busy) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") || "");
    const confirmPassword = String(fields.get("confirmPassword") || "");
    if (password !== confirmPassword) { setModalError("Passwords must match"); return; }
    if (new TextEncoder().encode(password).length > 72) { setModalError("Password must not exceed 72 bytes"); return; }
    setBusy(true); setModalError("");
    try {
      const response = modal === "add" ? await api.post("/employees/management", {
        employeeCode: String(fields.get("employeeCode")).trim(), fullName: String(fields.get("fullName")).trim(),
        departmentId: Number(fields.get("departmentId")), email: String(fields.get("email")).trim(),
        password, confirmPassword, isActive: fields.get("status") === "ACTIVE",
      }) : await api.patch(`/employees/management/${modal.id}/password`, { password, confirmPassword });
      setSuccess(response.data.message); setModal(null); refresh(n => n + 1);
    } catch (e) { setModalError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function toggle(employee: Employee) {
    if (busy || !window.confirm(`${employee.isActive ? "Deactivate" : "Activate"} ${employee.fullName}?`)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await api.patch(`/employees/management/${employee.id}/status`, { isActive: !employee.isActive });
      setSuccess(response.data.message); refresh(n => n + 1);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="employee-management">
    <div className="em-heading"><h1>Employee Management</h1><button className="em-primary" disabled={busy} onClick={() => open("add")}>+ Add Employee</button></div>
    {success && <p className="em-success" role="status">{success}</p>}
    {(error || departmentError) && <p className="em-error" role="alert">{error || departmentError} <button onClick={() => refresh(n => n + 1)}>Retry</button></p>}
    <div className="em-filters">
      <label>Search<input type="search" maxLength={191} placeholder="Employee code, name or login ID" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Department<select value={departmentId} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option>ACTIVE</option><option>INACTIVE</option></select></label>
    </div>
    <div className="em-table-wrap" tabIndex={0} aria-label="Employees" aria-busy={loading}><table>
      <thead><tr>{["Employee Code", "Employee Name", "Department", "Login ID", "Status", "Action"].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={6}>Loading employees…</td></tr> : rows.length === 0 ? <tr><td colSpan={6}>No employees found.</td></tr> : rows.map(e => <tr key={e.id}>
        <td>{e.employeeCode || "—"}</td><td>{e.fullName}</td><td>{e.departmentName || "—"}</td><td>{e.loginEmail || "No login linked"}</td>
        <td><span className={`em-badge ${e.isActive ? "active" : "inactive"}`}>{e.isActive ? "ACTIVE" : "INACTIVE"}</span></td>
        <td><div className="em-actions"><button disabled={busy || !e.userId} onClick={() => open(e)}>Reset Password</button><button disabled={busy || !e.userId} onClick={() => toggle(e)}>{e.isActive ? "Deactivate" : "Activate"}</button></div>{!e.userId && <small>A linked login is required.</small>}</td>
      </tr>)}</tbody>
    </table></div>
    <dialog ref={dialog} className="em-dialog" aria-labelledby="em-title" onCancel={e => { e.preventDefault(); if (!busy) setModal(null); }}>
      {modal && <form key={modal === "add" ? "add" : modal.id} onSubmit={save}>
        <h2 id="em-title">{modal === "add" ? "Add Employee" : `Reset Password — ${modal.fullName}`}</h2>
        {modalError && <p className="em-error" role="alert">{modalError}</p>}
        <fieldset disabled={busy}>
          {modal === "add" && <>
            <label>Employee Code *<input name="employeeCode" required maxLength={191} autoFocus /></label>
            <label>Employee Name *<input name="fullName" required maxLength={191} /></label>
            <label>Department *<select name="departmentId" required defaultValue=""><option value="" disabled>Select department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Login Email / ID *<input name="email" type="email" required maxLength={191} autoComplete="off" /></label>
          </>}
          <label>{modal === "add" ? "Password" : "New Password"} *<input name="password" type="password" required minLength={6} autoComplete="new-password" autoFocus={modal !== "add"} /></label>
          <small>At least 6 characters; maximum 72 bytes.</small>
          <label>Confirm Password *<input name="confirmPassword" type="password" required minLength={6} autoComplete="new-password" /></label>
          {modal === "add" && <label>Status *<select name="status" defaultValue="ACTIVE" required><option>ACTIVE</option><option>INACTIVE</option></select></label>}
        </fieldset>
        <div className="em-modal-actions"><button type="button" disabled={busy} onClick={() => setModal(null)}>Cancel</button><button className="em-primary" type="submit" disabled={busy}>{busy ? "Saving…" : modal === "add" ? "Add Employee" : "Update Password"}</button></div>
      </form>}
    </dialog>
  </section>;
}
