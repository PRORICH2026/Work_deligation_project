import {

  useEffect,

  useMemo,

  useState,

  type FormEvent,

} from "react";



import {

  useNavigate,

} from "react-router-dom";



import api from "../services/api";



import type {
  CurrentUser,
} from "../types/user";

import type {
  Employee,
} from "../types/employee";

import type {
  Task,
} from "../types/task";

import {
  formatDateOnly,
  getDueStatus,
} from "../utils/taskUtils";

const managementRoles = [

  "ADMIN",

  "MD",

  "HR",

  "EA",

];



export default function Tasks() {

  const navigate =

    useNavigate();



  const [

    currentUser,

    setCurrentUser,

  ] = useState<CurrentUser | null>(

    null

  );



  const [

    tasks,

    setTasks,

  ] = useState<Task[]>([]);



  const [

    employees,

    setEmployees,

  ] = useState<Employee[]>([]);



  /* ==========================================

     ASSIGN EMPLOYEE

  ========================================== */



  const [

    selectedTask,

    setSelectedTask,

  ] = useState<Task | null>(

    null

  );



  const [

    employeeId,

    setEmployeeId,

  ] = useState("");



  const [

    startDate,

    setStartDate,

  ] = useState("");



  const [

    targetDate,

    setTargetDate,

  ] = useState("");



  const [

    assignmentRemarks,

    setAssignmentRemarks,

  ] = useState("");



  /* ==========================================

     UPDATE DELEGATION

  ========================================== */



  const [

    updateTask,

    setUpdateTask,

  ] = useState<Task | null>(

    null

  );



  const [

    newStatus,

    setNewStatus,

  ] = useState("");



  const [

    statusNote,

    setStatusNote,

  ] = useState("");



  const [

    delayReason,

    setDelayReason,

  ] = useState("");



  const [

    newTargetDate,

    setNewTargetDate,

  ] = useState("");



  /* ==========================================

     COMMON

  ========================================== */



  const [

    message,

    setMessage,

  ] = useState("");



  const [

    error,

    setError,

  ] = useState("");



  const [

    loading,

    setLoading,

  ] = useState(false);



  useEffect(() => {

    loadData();

  }, []);



  /* ==========================================

     SORT TASKS

  ========================================== */



  const sortedTasks =

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



      return [...tasks].sort(

        (a, b) => {

          const aOrder =

            statusOrder[a.status] ??

            99;



          const bOrder =

            statusOrder[b.status] ??

            99;



          if (

            aOrder !== bOrder

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

    }, [tasks]);



  /* ==========================================

     COUNT CARDS

  ========================================== */



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

     LOAD DATA

  ========================================== */



  async function loadData() {

    setError("");



    try {

      const userResponse =

        await api.get(

          "/auth/me"

        );



      setCurrentUser(

        userResponse.data.user

      );



    } catch (error: any) {



      if (

        error.response?.status ===

        401

      ) {

        navigate("/");

      }



      return;

    }



    try {

      const taskResponse =

        await api.get(

          "/tasks"

        );



      setTasks(

        taskResponse.data.data ||

          []

      );



    } catch (error: any) {



      console.error(

        "TASK LOAD ERROR:",

        error

      );



      setTasks([]);



      setError(

        error.response?.data

          ?.message ||

          "Unable to load delegations"

      );

    }

  }



  /* ==========================================

     ROLE CHECK

  ========================================== */



  function isManagementUser() {

    if (!currentUser) {

      return false;

    }



    return managementRoles.includes(

      currentUser.role

    );

  }



  /* ==========================================

     EMPLOYEE VIEW

  ========================================== */



  function canEmployeeViewTask(

    task: Task

  ) {

    if (

      !currentUser ||

      currentUser.role !==

        "EMPLOYEE"

    ) {

      return false;

    }



    const createdByEmployee =

      Number(

        task.createdById

      ) ===

      Number(

        currentUser.id

      );



    const assignedToEmployee =

      Number(

        task.assignedEmployeeUserId

      ) ===

      Number(

        currentUser.id

      );



    return (

      createdByEmployee ||

      assignedToEmployee

    );

  }



  /* ==========================================

     ASSIGN PERMISSION



     NEW TASK:

     ASSIGN ONLY

  ========================================== */



  function canAssign(

    task: Task

  ) {

    if (

      !isManagementUser()

    ) {

      return false;

    }



    if (

      task.status !== "NEW"

    ) {

      return false;

    }



    if (

      task.responsibility !==

      "EA"

    ) {

      return false;

    }



    if (

      task.assignedEmployeeId

    ) {

      return false;

    }



    return true;

  }



  /* ==========================================

     UPDATE PERMISSION



     ONLY AFTER EMPLOYEE ASSIGNMENT

  ========================================== */



  function canUpdateTask(

    task: Task

  ) {

    if (

      !isManagementUser()

    ) {

      return false;

    }



    if (

      task.status ===

        "NEW"

    ) {

      return false;

    }



    if (

      task.status ===

        "COMPLETED" ||

      task.status ===

        "CANCELLED"

    ) {

      return false;

    }



    if (

      task.responsibility !==

        "EMPLOYEE"

    ) {

      return false;

    }



    if (

      !task.assignedEmployeeId

    ) {

      return false;

    }



    return true;

  }



  /* ==========================================

     CANCEL PERMISSION

     MANAGEMENT CAN CANCEL ANY OPEN
     DELEGATION, INCLUDING NEW.

  ========================================== */



  function canCancelTask(

    task: Task

  ) {

    if (

      !isManagementUser()

    ) {

      return false;

    }



    if (

      task.status ===

        "COMPLETED" ||

      task.status ===

        "CANCELLED"

    ) {

      return false;

    }



    return true;

  }



  /* ==========================================

     OPEN ASSIGN

  ========================================== */



  async function openAssignTask(

    task: Task

  ) {

    setSelectedTask(task);



    setEmployeeId("");

    setStartDate("");

    setTargetDate("");

    setAssignmentRemarks("");



    setMessage("");

    setError("");



    try {

      const response =

        await api.get(

          `/employees?departmentId=${task.departmentId}`

        );



      setEmployees(

        response.data.data ||

          []

      );



    } catch (error: any) {



      setEmployees([]);



      setError(

        error.response?.data

          ?.message ||

          "Unable to load employees"

      );

    }

  }



  /* ==========================================

     ASSIGN

  ========================================== */



  async function assignEmployee(

    e: FormEvent

  ) {

    e.preventDefault();



    if (!selectedTask) {

      return;

    }



    if (

      targetDate <

      startDate

    ) {

      setError(

        "Target date cannot be before start date."

      );



      return;

    }



    setLoading(true);



    setMessage("");

    setError("");



    try {

      await api.patch(

        `/tasks/${selectedTask.id}/assign`,

        {

          assignedEmployeeId:

            Number(

              employeeId

            ),



          startDate,



          targetDate,



          assignmentRemarks:

            assignmentRemarks.trim(),

        }

      );



      setMessage(

        `Delegation #${selectedTask.id} assigned successfully.`

      );



      setSelectedTask(

        null

      );



      setEmployeeId("");



      setStartDate("");



      setTargetDate("");



      setAssignmentRemarks("");



      await loadData();



    } catch (error: any) {



      setError(

        error.response?.data

          ?.message ||

          "Unable to assign delegation"

      );



    } finally {



      setLoading(false);

    }

  }



  /* ==========================================

     OPEN UPDATE

  ========================================== */



  function openUpdateTask(

    task: Task

  ) {

    setUpdateTask(task);



    /*

      Do not preselect a status.



      Management must deliberately

      select what happened.

    */



    setNewStatus("");



    setStatusNote("");



    setDelayReason("");



    setNewTargetDate("");



    setMessage("");



    setError("");

  }



  /* ==========================================

     OPEN CANCEL

     NEW DELEGATIONS DO NOT HAVE THE NORMAL
     UPDATE BUTTON, SO THEY USE A DIRECT
     CANCEL ACTION.

  ========================================== */



  function openCancelTask(

    task: Task

  ) {

    setUpdateTask(task);

    setNewStatus(
      "CANCELLED"
    );

    setStatusNote("");

    setDelayReason("");

    setNewTargetDate("");

    setMessage("");

    setError("");

  }



  /* ==========================================

     UPDATE WORKFLOW

  ========================================== */



  async function submitTaskUpdate(

    e: FormEvent

  ) {

    e.preventDefault();



    if (!updateTask) {

      return;

    }



    if (!newStatus) {

      setError(

        "Please select an update action."

      );



      return;

    }



    /*

      PENDING NEEDS REASON

    */



    if (

      newStatus ===

        "ON_HOLD" &&

      !statusNote.trim()

    ) {

      setError(

        "Please enter the pending reason."

      );



      return;

    }



    /*

      CANCELLATION NEEDS REASON

    */



    if (

      newStatus ===

        "CANCELLED" &&

      !statusNote.trim()

    ) {

      setError(

        "Please enter the cancellation reason."

      );



      return;

    }



    /*

      DELAY NEEDS REASON

      AND REVISED TARGET

    */



    if (

      newStatus ===

        "DELAYED"

    ) {

      if (

        !delayReason.trim()

      ) {

        setError(

          "Please enter the delay reason."

        );



        return;

      }



      if (

        !newTargetDate

      ) {

        setError(

          "Please select the revised target date."

        );



        return;

      }



      if (

        (

          updateTask

            .targetDateUpdateCount ||

          0

        ) >= 3

      ) {

        setError(

          "Maximum 3 target revisions are allowed."

        );



        return;

      }

    }



    setLoading(true);



    setMessage("");



    setError("");



    try {

      await api.patch(

        `/tasks/${updateTask.id}/status`,

        {

          status:

            newStatus,

          cancellationReason:
            newStatus === "CANCELLED" ? statusNote.trim() : undefined,



          note:

            newStatus !==

            "DELAYED"

              ? statusNote.trim()

              : undefined,



          delayReason:

            newStatus ===

            "DELAYED"

              ? delayReason.trim()

              : undefined,



          newTargetDate:

            newStatus ===

            "DELAYED"

              ? newTargetDate

              : undefined,

        }

      );



      let successText =

        "updated";



      if (

        newStatus ===

        "ON_HOLD"

      ) {

        successText =

          "moved to Pending";

      }



      if (

        newStatus ===

        "DELAYED"

      ) {

        successText =

          "marked Delayed";

      }



      if (

        newStatus ===

        "COMPLETED"

      ) {

        successText =

          "completed";

      }



      if (

        newStatus ===

        "CANCELLED"

      ) {

        successText =

          "cancelled";

      }



      if (

        newStatus ===

        "IN_PROGRESS"

      ) {

        successText =

          "moved to In Progress";

      }



      setMessage(

        `Delegation #${updateTask.id} ${successText} successfully.`

      );



      setUpdateTask(

        null

      );



      setNewStatus("");



      setStatusNote("");



      setDelayReason("");



      setNewTargetDate("");



      await loadData();



    } catch (error: any) {



      setError(

        error.response?.data

          ?.message ||

          "Unable to update delegation"

      );



    } finally {



      setLoading(false);

    }

  }





  /* ==========================================

     MINIMUM REVISED TARGET

  ========================================== */



  function minimumRevisedTarget(

    value?: string

  ) {

    if (!value) {

      return undefined;

    }



    const date =

      new Date(value);



    if (

      Number.isNaN(

        date.getTime()

      )

    ) {

      return undefined;

    }



    date.setDate(

      date.getDate() + 1

    );



    const year =

      date.getFullYear();



    const month =

      String(

        date.getMonth() + 1

      ).padStart(

        2,

        "0"

      );



    const day =

      String(

        date.getDate()

      ).padStart(

        2,

        "0"

      );



    return `${year}-${month}-${day}`;

  }



  /* ==========================================

     STATUS DISPLAY

  ========================================== */



  function displayStatus(

    status: string

  ) {

    if (

      status ===

      "ON_HOLD"

    ) {

      return "PENDING";

    }



    if (

      status ===

      "COMPLETED"

    ) {

      return "COMPLETE";

    }



    return status.replaceAll(

      "_",

      " "

    );

  }



  /* ==========================================

     UPDATE ACTION LABEL

  ========================================== */



  function progressOptionLabel() {

    if (

      updateTask?.status ===

        "ON_HOLD" ||

      updateTask?.status ===

        "DELAYED"

    ) {

      return "Resume Work";

    }



    return "Keep In Progress";

  }



  /* ==========================================

     PAGE

  ========================================== */



  return (

    <div className="tasks-page">



      {/* COUNT CARDS */}



      <div className="task-stats">



        <Stat

          label="Total"

          value={

            tasks.length

          }

        />



        <Stat

          label="New"

          value={

            newCount

          }

        />



        <Stat

          label="In Progress"

          value={

            inProgressCount

          }

        />



        <Stat

          label="Pending"

          value={

            pendingCount

          }

        />



      </div>



      {/* MESSAGES */}



      {message && (

        <div className="task-message">

          {message}

        </div>

      )}



      {error && (

        <div className="task-error">

          {error}

        </div>

      )}



      {/* ======================================

          TABLE

      ====================================== */}



      <div className="task-table-card">



        <table className="task-table">



          <thead>



            <tr>



              <th>ID</th>



              <th>Task</th>



              <th>

                Department

              </th>



              <th>

                Priority

              </th>





              <th>

                Employee

              </th>



              <th>

                Target

              </th>



              <th>

                Due Status

              </th>



              <th>

                Responsibility

              </th>



              <th>

                Status

              </th>



              <th>

                Created By

              </th>



              <th>

                Action

              </th>



            </tr>



          </thead>



          <tbody>



            {sortedTasks.length ===

            0 ? (



              <tr>



                <td

                  colSpan={11}

                  className="empty-table"

                >

                  No delegations

                  found.

                </td>



              </tr>



            ) : (



              sortedTasks.map(

                (task) => (



                  <tr

                    key={

                      task.id

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

                        task.priority

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

                      {getDueStatus(

                        task

                      ).label ===

                      "-" ? (

                        "-"

                      ) : (

                        <span

                          className={`due-pill ${getDueStatus(

                            task

                          ).className}`}

                        >

                          {getDueStatus(

                            task

                          ).label}

                        </span>

                      )}

                    </td>



                    <td>

                      {

                        task.responsibility

                      }

                    </td>



                    <td>



                      <span

                        className={`status-pill status-${task.status.toLowerCase()}`}

                      >

                        {displayStatus(

                          task.status

                        )}

                      </span>



                    </td>



                    <td>

                      {

                        task.createdByName

                      }

                    </td>



                    <td>



                      <div

                        style={{

                          display:

                            "flex",



                          gap: "6px",



                          flexWrap:

                            "wrap",



                          alignItems:

                            "center",

                        }}

                      >



                        {/* EMPLOYEE */}



                        {canEmployeeViewTask(

                          task

                        ) && (



                          <button

                            className="back-button"



                            style={{

                              padding:

                                "7px 12px",



                              fontSize:

                                "12px",

                            }}



                            onClick={() =>

                              navigate(

                                `/tasks/${task.id}`

                              )

                            }

                          >

                            View

                          </button>



                        )}



                        {/* NEW = ASSIGN ONLY */}



                        {canAssign(

                          task

                        ) && (



                          <button

                            className="assign-button"



                            onClick={() =>

                              openAssignTask(

                                task

                              )

                            }

                          >

                            Assign

                          </button>



                        )}



                        {/* NEW = CANCEL OPTION */}



                        {canCancelTask(

                          task

                        ) &&

                          task.status ===

                            "NEW" && (



                          <button

                            className="back-button"



                            style={{

                              padding:

                                "7px 12px",

                              fontSize:

                                "12px",

                              color:

                                "#b91c1c",

                              borderColor:

                                "#fecaca",

                              background:

                                "#fef2f2",

                              fontWeight:

                                600,

                            }}



                            onClick={() =>

                              openCancelTask(

                                task

                              )

                            }

                          >

                            Cancel

                          </button>



                        )}



                        {/* ASSIGNED = UPDATE ONLY */}



                        {canUpdateTask(

                          task

                        ) && (



                          <button

                            className="update-task-button"



                            onClick={() =>

                              openUpdateTask(

                                task

                              )

                            }

                          >

                            Update

                          </button>



                        )}



                        {!canEmployeeViewTask(

                          task

                        ) &&

                          !canAssign(

                            task

                          ) &&

                          !canUpdateTask(

                            task

                          ) && (

                            <span>

                              -

                            </span>

                          )}



                      </div>



                    </td>



                  </tr>



                )

              )

            )}



          </tbody>



        </table>



      </div>



      {/* ======================================

          ASSIGN MODAL

      ====================================== */}



      {selectedTask && (



        <div className="modal-overlay">



          <div className="assign-modal">



            <div className="modal-header">



              <div>



                <h2>

                  Assign Employee

                </h2>



                <p>

                  #{selectedTask.id}

                  {" — "}

                  {selectedTask.title}

                </p>



              </div>



              <button

                type="button"

                className="modal-close"



                onClick={() =>

                  setSelectedTask(

                    null

                  )

                }

              >

                ×

              </button>



            </div>



            <div className="assignment-info">



              <div>



                <span>

                  Department

                </span>



                <strong>

                  {

                    selectedTask.departmentName

                  }

                </strong>



              </div>



              <div>



                <span>

                  Priority

                </span>



                <strong>

                  {

                    selectedTask.priority

                  }

                </strong>



              </div>



              <div>



                <span>

                  Responsibility

                </span>



                <strong>

                  {

                    selectedTask.responsibility

                  }

                </strong>



              </div>



            </div>



            <form

              onSubmit={

                assignEmployee

              }

            >



              <div className="form-group">



                <label>

                  Employee *

                </label>



                <select

                  value={

                    employeeId

                  }



                  onChange={(e) =>

                    setEmployeeId(

                      e.target.value

                    )

                  }



                  required

                >



                  <option value="">

                    Select Employee

                  </option>



                  {employees.map(

                    (employee) => (



                      <option

                        key={

                          employee.id

                        }



                        value={

                          employee.id

                        }

                      >



                        {

                          employee.fullName

                        }



                        {employee.employeeCode

                          ? ` (${employee.employeeCode})`

                          : ""}



                      </option>



                    )

                  )}



                </select>



                {employees.length ===

                  0 && (



                  <small className="field-warning">

                    No active employee

                    found for this

                    department.

                  </small>



                )}



              </div>



              <div className="form-group">



                <label>

                  Start Date *

                </label>



                <input

                  type="date"



                  value={

                    startDate

                  }



                  onChange={(e) =>

                    setStartDate(

                      e.target.value

                    )

                  }



                  required

                />



              </div>



              <div className="form-group">



                <label>

                  Target Date *

                </label>



                <input

                  type="date"



                  min={

                    startDate ||

                    undefined

                  }



                  value={

                    targetDate

                  }



                  onChange={(e) =>

                    setTargetDate(

                      e.target.value

                    )

                  }



                  required

                />



              </div>



              <div className="form-group">



                <label>

                  Assignment Remarks

                </label>



                <textarea

                  rows={3}



                  value={

                    assignmentRemarks

                  }



                  onChange={(e) =>

                    setAssignmentRemarks(

                      e.target.value

                    )

                  }



                  placeholder="Enter remarks if required"

                />



              </div>



              <div className="assignment-result">



                <span>

                  After assignment:

                </span>



                <strong>

                  Responsibility →

                  EMPLOYEE

                </strong>



                <strong>

                  Status →

                  IN PROGRESS

                </strong>



              </div>



              <div className="task-form-actions">



                <button

                  type="button"

                  className="back-button"



                  onClick={() =>

                    setSelectedTask(

                      null

                    )

                  }

                >

                  Cancel

                </button>



                <button

                  type="submit"

                  className="primary-button"



                  disabled={

                    loading ||

                    employees.length ===

                      0

                  }

                >

                  {loading

                    ? "Assigning..."

                    : "Assign & Start"}

                </button>



              </div>



            </form>



          </div>



        </div>



      )}



      {/* ======================================

          UPDATE MODAL

      ====================================== */}



      {updateTask && (



        <div className="modal-overlay">



          <div className="assign-modal">



            <div className="modal-header">



              <div>



                <h2>

                  Update Delegation

                </h2>



                <p>

                  #{updateTask.id}

                  {" — "}

                  {updateTask.title}

                </p>



              </div>



              <button

                type="button"

                className="modal-close"



                onClick={() =>

                  setUpdateTask(

                    null

                  )

                }

              >

                ×

              </button>



            </div>



            {/* CURRENT INFORMATION */}



            <div className="assignment-info">



              <div>



                <span>

                  Current Status

                </span>



                <strong>

                  {displayStatus(

                    updateTask.status

                  )}

                </strong>



              </div>



              <div>



                <span>

                  Employee

                </span>



                <strong>

                  {

                    updateTask.assignedEmployeeName ||

                    "-"

                  }

                </strong>



              </div>



              <div>



                <span>

                  Current Target

                </span>



                <strong>

                  {formatDateOnly(

                    updateTask.currentTargetDate

                  )}

                </strong>



              </div>



            </div>



            <form

              onSubmit={

                submitTaskUpdate

              }

            >



              {/* UPDATE ACTION */}



              {updateTask.status ===

              "NEW" ? (



                <div className="form-group">



                  <label>

                    Update Action

                  </label>



                  <input

                    type="text"

                    value="Cancel Delegation"

                    disabled

                  />



                </div>



              ) : (



                <div className="form-group">



                  <label>

                    Update Action *

                  </label>



                  <select

                    value={

                      newStatus

                    }



                    onChange={(e) => {

                      setNewStatus(

                        e.target.value

                      );



                      setStatusNote("");



                      setDelayReason("");



                      setNewTargetDate("");

                    }}



                    required

                  >



                    <option value="">

                      Select Action

                    </option>



                    <option value="IN_PROGRESS">

                      {progressOptionLabel()}

                    </option>



                    <option value="ON_HOLD">

                      Move to Pending

                    </option>



                    <option value="DELAYED">

                      Delay / Revise Target

                    </option>



                    <option value="COMPLETED">

                      Complete Delegation

                    </option>



                    <option value="CANCELLED">

                      Cancel Delegation

                    </option>



                  </select>



                </div>



              )}



              {/* IN PROGRESS */}



              {newStatus ===

                "IN_PROGRESS" && (



                <div className="form-group">



                  <label>

                    Progress Remarks

                  </label>



                  <textarea

                    rows={3}



                    value={

                      statusNote

                    }



                    onChange={(e) =>

                      setStatusNote(

                        e.target.value

                      )

                    }



                    placeholder="Enter progress remarks if required"

                  />



                </div>



              )}



              {/* PENDING */}



              {newStatus ===

                "ON_HOLD" && (



                <div className="form-group">



                  <label>

                    Pending Reason *

                  </label>



                  <textarea

                    rows={3}



                    value={

                      statusNote

                    }



                    onChange={(e) =>

                      setStatusNote(

                        e.target.value

                      )

                    }



                    placeholder="Why is this delegation pending?"



                    required

                  />



                </div>



              )}



              {/* DELAY */}



              {newStatus ===

                "DELAYED" && (

                <>



                  <div className="delay-warning">



                    Current Target:{" "}



                    <strong>

                      {formatDateOnly(

                        updateTask.currentTargetDate

                      )}

                    </strong>



                    <br />



                    Target revisions used:{" "}



                    <strong>

                      {

                        updateTask.targetDateUpdateCount ||

                        0

                      }

                      {" / 3"}

                    </strong>



                  </div>



                  <div className="form-group">



                    <label>

                      Delay Reason *

                    </label>



                    <textarea

                      rows={3}



                      value={

                        delayReason

                      }



                      onChange={(e) =>

                        setDelayReason(

                          e.target.value

                        )

                      }



                      placeholder="Why is the target date being revised?"



                      required

                    />



                  </div>



                  <div className="form-group">



                    <label>

                      Revised Target Date *

                    </label>



                    <input

                      type="date"



                      min={

                        minimumRevisedTarget(

                          updateTask.currentTargetDate

                        )

                      }



                      value={

                        newTargetDate

                      }



                      onChange={(e) =>

                        setNewTargetDate(

                          e.target.value

                        )

                      }



                      required

                    />



                  </div>



                </>

              )}



              {/* COMPLETED */}



              {newStatus ===

                "COMPLETED" && (

                <>



                  <div className="completion-warning">

                    This will close the delegation and move it to the bottom of Task Management.

                  </div>



                  <div className="form-group">



                    <label>

                      Completion Remarks

                    </label>



                    <textarea

                      rows={3}



                      value={

                        statusNote

                      }



                      onChange={(e) =>

                        setStatusNote(

                          e.target.value

                        )

                      }



                      placeholder="Enter completion remarks if required"

                    />



                  </div>



                </>

              )}



              {/* CANCELLED */}



              {newStatus ===

                "CANCELLED" && (

                <>



                  <div className="delay-warning">

                    Cancelling will permanently close this delegation. It cannot be assigned or updated afterwards.

                  </div>



                  <div className="form-group">



                    <label>

                      Cancellation Reason *

                    </label>



                    <textarea

                      rows={3}



                      value={

                        statusNote

                      }



                      onChange={(e) =>

                        setStatusNote(

                          e.target.value

                        )

                      }



                      placeholder="Why is this delegation being cancelled?"



                      required

                    />



                  </div>



                </>

              )}



              {/* BUTTONS */}



              <div className="task-form-actions">



                <button

                  type="button"

                  className="back-button"



                  onClick={() =>

                    setUpdateTask(

                      null

                    )

                  }

                >

                  Cancel

                </button>



                <button

                  type="submit"

                  className="primary-button"

                  style={

                    newStatus ===

                    "CANCELLED"

                      ? {

                          background:

                            "#b91c1c",

                        }

                      : undefined

                  }



                  disabled={

                    loading ||

                    !newStatus ||

                    (

                      newStatus ===

                        "DELAYED" &&

                      (

                        updateTask.targetDateUpdateCount ||

                        0

                      ) >= 3

                    )

                  }

                >



                  {loading

                    ? newStatus ===

                      "CANCELLED"

                      ? "Cancelling..."

                      : "Updating..."

                    : newStatus ===

                      "CANCELLED"

                      ? "Cancel Delegation"

                      : "Save Update"}



                </button>



              </div>



            </form>



          </div>



        </div>



      )}



    </div>

  );

}



function Stat({

  label,

  value,

}: {

  label: string;

  value: number;

}) {

  return (

    <div className="task-stat">



      <span>

        {label}

      </span>



      <strong>

        {value}

      </strong>



    </div>

  );

}
