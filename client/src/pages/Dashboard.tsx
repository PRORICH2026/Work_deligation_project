import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./Dashboard.css";

interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Task {
  id: number;

  title: string;
  description?: string;

  priority: string;
  status: string;
  responsibility: string;

  departmentId: number;
  departmentName: string;

  createdById: number;
  createdByName: string;

  assignedEaId?: number;
  assignedEaName?: string;

  assignedEmployeeId?: number;
  assignedEmployeeName?: string;
  assignedEmployeeUserId?: number;

  startDate?: string;

  originalTargetDate?: string;
  currentTargetDate?: string;

  delayCount: number;
  targetDateUpdateCount: number;

  completedAt?: string;

  createdAt: string;
  updatedAt?: string;
}

type DueStatusKey =
  | "ON_TIME"
  | "DUE_TODAY"
  | "OVERDUE"
  | "NONE";

interface DueStatusResult {
  key: DueStatusKey;
  label: string;
  className: string;
}

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

export default function Dashboard() {
  const navigate =
    useNavigate();

  const [
    tasks,
    setTasks,
  ] = useState<Task[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  /* ==========================================
     FILTERS
  ========================================== */

  const [
    searchText,
    setSearchText,
  ] = useState("");

  const [
    departmentFilter,
    setDepartmentFilter,
  ] = useState("");

  const [
    employeeFilter,
    setEmployeeFilter,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    dueStatusFilter,
    setDueStatusFilter,
  ] = useState("");

  const [
    fromDate,
    setFromDate,
  ] = useState("");

  const [
    toDate,
    setToDate,
  ] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  /* ==========================================
     LOAD DATA
  ========================================== */

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const userResponse =
        await api.get(
          "/auth/me"
        );

      const user:
        CurrentUser =
        userResponse.data.user;

      if (
        !managementRoles.includes(
          user.role
        )
      ) {
        navigate(
          "/tasks",
          {
            replace: true,
          }
        );

        return;
      }

      const taskResponse =
        await api.get(
          "/tasks"
        );

      setTasks(
        taskResponse.data.data ||
          []
      );

    } catch (error: any) {

      if (
        error.response?.status ===
        401
      ) {
        navigate("/");
        return;
      }

      setError(
        error.response?.data
          ?.message ||
          "Unable to load delegations"
      );

    } finally {

      setLoading(false);
    }
  }

  /* ==========================================
     STATUS GROUP
  ========================================== */

  function getStatusGroup(
    status: string
  ) {
    if (
      status === "ON_HOLD" ||
      status === "DELAYED"
    ) {
      return "PENDING";
    }

    return status;
  }

  /* ==========================================
     COUNTS
  ========================================== */

  const totalCount =
    tasks.length;

  const newCount =
    tasks.filter(
      (task) =>
        task.status === "NEW"
    ).length;

  const inProgressCount =
    tasks.filter(
      (task) =>
        task.status ===
        "IN_PROGRESS"
    ).length;

  const pendingCount =
    tasks.filter(
      (task) =>
        task.status ===
          "ON_HOLD" ||
        task.status ===
          "DELAYED"
    ).length;

  /* ==========================================
     DEPARTMENT OPTIONS
  ========================================== */

  const departments =
    useMemo(() => {
      return Array.from(
        new Set(
          tasks
            .map(
              (task) =>
                task.departmentName
            )
            .filter(Boolean)
        )
      ).sort();
    }, [tasks]);

  /* ==========================================
     EMPLOYEE OPTIONS
  ========================================== */

  const employees =
    useMemo(() => {
      return Array.from(
        new Set(
          tasks
            .map(
              (task) =>
                task.assignedEmployeeName
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      ).sort();
    }, [tasks]);

  /* ==========================================
     DUE STATUS

     This is calculated from currentTargetDate.
     If target was revised, currentTargetDate
     already contains the latest target.
  ========================================== */

  function getDueStatus(
    task: Task
  ): DueStatusResult {
    if (
      task.status ===
        "COMPLETED" ||
      task.status ===
        "CANCELLED" ||
      !task.currentTargetDate
    ) {
      return {
        key: "NONE",
        label: "-",
        className: "",
      };
    }

    const target =
      new Date(
        task.currentTargetDate
      );

    if (
      Number.isNaN(
        target.getTime()
      )
    ) {
      return {
        key: "NONE",
        label: "-",
        className: "",
      };
    }

    const today =
      new Date();

    const todayKey =
      today.getFullYear() *
        10000 +
      (today.getMonth() + 1) *
        100 +
      today.getDate();

    const targetKey =
      target.getFullYear() *
        10000 +
      (target.getMonth() + 1) *
        100 +
      target.getDate();

    if (
      targetKey <
      todayKey
    ) {
      return {
        key: "OVERDUE",
        label: "OVERDUE",
        className:
          "due-overdue",
      };
    }

    if (
      targetKey ===
      todayKey
    ) {
      return {
        key: "DUE_TODAY",
        label: "DUE TODAY",
        className:
          "due-today",
      };
    }

    return {
      key: "ON_TIME",
      label: "ON TIME",
      className:
        "due-on-time",
    };
  }

  /* ==========================================
     FILTER + SORT
  ========================================== */

  const filteredTasks =
    useMemo(() => {
      const statusOrder:
        Record<string, number> = {
          NEW: 1,
          IN_PROGRESS: 2,
          ON_HOLD: 3,
          DELAYED: 3,
          COMPLETED: 4,
          CANCELLED: 5,
        };

      const search =
        searchText
          .trim()
          .toLowerCase();

      const filtered =
        tasks.filter(
          (task) => {
            /* SEARCH */

            if (search) {
              const searchableText = [
                task.id,
                `#${task.id}`,
                task.title,
                task.departmentName,
                task.createdByName,
                task.assignedEmployeeName,
                task.status,
                getDueStatus(
                  task
                ).label,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

              if (
                !searchableText.includes(
                  search
                )
              ) {
                return false;
              }
            }

            /* DEPARTMENT */

            if (
              departmentFilter &&
              task.departmentName !==
                departmentFilter
            ) {
              return false;
            }

            /* EMPLOYEE */

            if (
              employeeFilter &&
              task.assignedEmployeeName !==
                employeeFilter
            ) {
              return false;
            }

            /* STATUS */

            if (
              statusFilter
            ) {
              if (
                statusFilter ===
                "PENDING"
              ) {
                if (
                  getStatusGroup(
                    task.status
                  ) !==
                  "PENDING"
                ) {
                  return false;
                }

              } else if (
                task.status !==
                statusFilter
              ) {
                return false;
              }
            }

            /* DUE STATUS */

            if (
              dueStatusFilter &&
              getDueStatus(
                task
              ).key !==
                dueStatusFilter
            ) {
              return false;
            }

            /* FROM / TO CREATED DATE */

            if (
              fromDate ||
              toDate
            ) {
              const created =
                new Date(
                  task.createdAt
                );

              if (
                Number.isNaN(
                  created.getTime()
                )
              ) {
                return false;
              }

              if (
                fromDate
              ) {
                const from =
                  new Date(
                    `${fromDate}T00:00:00`
                  );

                if (
                  created < from
                ) {
                  return false;
                }
              }

              if (
                toDate
              ) {
                const to =
                  new Date(
                    `${toDate}T23:59:59.999`
                  );

                if (
                  created > to
                ) {
                  return false;
                }
              }
            }

            return true;
          }
        );

      return filtered.sort(
        (a, b) => {
          const aOrder =
            statusOrder[
              a.status
            ] ?? 99;

          const bOrder =
            statusOrder[
              b.status
            ] ?? 99;

          if (
            aOrder !==
            bOrder
          ) {
            return (
              aOrder -
              bOrder
            );
          }

          return (
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
          );
        }
      );

    }, [
      tasks,
      searchText,
      departmentFilter,
      employeeFilter,
      statusFilter,
      dueStatusFilter,
      fromDate,
      toDate,
    ]);

  /* ==========================================
     CLEAR FILTERS
  ========================================== */

  function clearFilters() {
    setSearchText("");
    setDepartmentFilter("");
    setEmployeeFilter("");
    setStatusFilter("");
    setDueStatusFilter("");
    setFromDate("");
    setToDate("");
  }

  /* ==========================================
     DATE
  ========================================== */

  function formatDateOnly(
    value?: string
  ) {
    if (!value) {
      return "-";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return date.toLocaleDateString();
  }

  function formatStatus(
    status: string
  ) {
    return status.replaceAll(
      "_",
      " "
    );
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        Loading delegations...
      </div>
    );
  }

  return (
    <div className="all-delegations-page">

      {/* COUNT CARDS */}

      <div className="delegation-stats">

        <StatCard
          label="Total"
          value={
            totalCount
          }
        />

        <StatCard
          label="New"
          value={
            newCount
          }
        />

        <StatCard
          label="In Progress"
          value={
            inProgressCount
          }
        />

        <StatCard
          label="Pending"
          value={
            pendingCount
          }
        />

      </div>

      {error && (
        <div className="delegation-error">
          {error}
        </div>
      )}

      {/* FILTERS */}

      <div className="delegation-filter-card">

        <div className="delegation-filter-grid">

          {/* SEARCH */}

          <div className="delegation-filter-field search-field">

            <label>
              Search
            </label>

            <input
              type="text"

              value={
                searchText
              }

              onChange={(e) =>
                setSearchText(
                  e.target.value
                )
              }

              placeholder="ID, task, department, creator..."
            />

          </div>

          {/* DEPARTMENT */}

          <div className="delegation-filter-field">

            <label>
              Department
            </label>

            <select
              value={
                departmentFilter
              }

              onChange={(e) =>
                setDepartmentFilter(
                  e.target.value
                )
              }
            >

              <option value="">
                All
              </option>

              {departments.map(
                (department) => (

                  <option
                    key={
                      department
                    }

                    value={
                      department
                    }
                  >
                    {
                      department
                    }
                  </option>

                )
              )}

            </select>

          </div>

          {/* EMPLOYEE */}

          <div className="delegation-filter-field">

            <label>
              Employee
            </label>

            <select
              value={
                employeeFilter
              }

              onChange={(e) =>
                setEmployeeFilter(
                  e.target.value
                )
              }
            >

              <option value="">
                All
              </option>

              {employees.map(
                (employee) => (

                  <option
                    key={
                      employee
                    }

                    value={
                      employee
                    }
                  >
                    {
                      employee
                    }
                  </option>

                )
              )}

            </select>

          </div>

          {/* STATUS */}

          <div className="delegation-filter-field">

            <label>
              Status
            </label>

            <select
              value={
                statusFilter
              }

              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
            >

              <option value="">
                All
              </option>

              <option value="NEW">
                New
              </option>

              <option value="IN_PROGRESS">
                In Progress
              </option>

              <option value="PENDING">
                Pending
              </option>

              <option value="COMPLETED">
                Completed
              </option>

              <option value="CANCELLED">
                Cancelled
              </option>

            </select>

          </div>

          {/* DUE STATUS */}

          <div className="delegation-filter-field">

            <label>
              Due Status
            </label>

            <select
              value={
                dueStatusFilter
              }

              onChange={(e) =>
                setDueStatusFilter(
                  e.target.value
                )
              }
            >

              <option value="">
                All
              </option>

              <option value="ON_TIME">
                On Time
              </option>

              <option value="DUE_TODAY">
                Due Today
              </option>

              <option value="OVERDUE">
                Overdue
              </option>

            </select>

          </div>

          {/* FROM DATE */}

          <div className="delegation-filter-field">

            <label>
              From Date
            </label>

            <input
              type="date"

              value={
                fromDate
              }

              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />

          </div>

          {/* TO DATE */}

          <div className="delegation-filter-field">

            <label>
              To Date
            </label>

            <input
              type="date"

              value={
                toDate
              }

              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />

          </div>

          {/* CLEAR */}

          <div className="delegation-filter-actions">

            <button
              type="button"

              onClick={
                clearFilters
              }
            >
              Clear Filters
            </button>

          </div>

        </div>

        <div className="delegation-result-count">

          Showing{" "}

          <strong>
            {
              filteredTasks.length
            }
          </strong>

          {" "}of{" "}

          <strong>
            {
              tasks.length
            }
          </strong>

          {" "}delegations

        </div>

      </div>

      {/* TABLE */}

      <div className="all-delegation-table-card">

        <div className="all-delegation-table-wrap">

          <table className="all-delegation-table">

            <thead>

              <tr>

                <th>ID</th>

                <th>
                  Task
                </th>

                <th>
                  Department
                </th>

                <th>
                  Created By
                </th>

                <th>
                  Employee
                </th>

                <th>
                  Target Date
                </th>

                <th>
                  Due Status
                </th>

                <th>
                  Status
                </th>

                <th>
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredTasks.length ===
              0 ? (

                <tr>

                  <td
                    colSpan={9}

                    className="all-delegation-empty"
                  >
                    No delegations match the selected filters.
                  </td>

                </tr>

              ) : (

                filteredTasks.map(
                  (task) => {
                    const dueStatus =
                      getDueStatus(
                        task
                      );

                    return (

                      <tr
                        key={
                          task.id
                        }

                        className={
                          task.status ===
                          "COMPLETED"
                            ? "completed-row"
                            : ""
                        }
                      >

                        <td>
                          #{task.id}
                        </td>

                        <td>
                          <strong>
                            {
                              task.title
                            }
                          </strong>
                        </td>

                        <td>
                          {
                            task.departmentName
                          }
                        </td>

                        <td>
                          {
                            task.createdByName
                          }
                        </td>

                        <td>
                          {
                            task.assignedEmployeeName ||
                            "-"
                          }
                        </td>

                        <td>
                          {formatDateOnly(
                            task.currentTargetDate
                          )}
                        </td>

                        <td>

                          {dueStatus.label ===
                          "-" ? (

                            "-"

                          ) : (

                            <span
                              className={`delegation-due-status ${dueStatus.className}`}
                            >
                              {
                                dueStatus.label
                              }
                            </span>

                          )}

                        </td>

                        <td>

                          <span
                            className={`delegation-status status-${task.status.toLowerCase()}`}
                          >
                            {formatStatus(
                              task.status
                            )}
                          </span>

                        </td>

                        <td>

                          <button
                            className="delegation-view-button"

                            onClick={() =>
                              navigate(
                                `/tasks/${task.id}`
                              )
                            }
                          >
                            View
                          </button>

                        </td>

                      </tr>

                    );
                  }
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="delegation-stat-card">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}
