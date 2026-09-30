import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "./TaskDetails.css";
import { formatDateOnly } from "../utils/taskUtils";

import type {
  Task,
} from "../types/task";

import type {
  StatusHistory,
  DelayHistory,
} from "../types/taskHistory";

export default function TaskDetails() {
  const navigate =
    useNavigate();

  const { id } =
    useParams();

  const [
    task,
    setTask,
  ] =
    useState<Task | null>(
      null
    );

  const [
    statusHistory,
    setStatusHistory,
  ] =
    useState<
      StatusHistory[]
    >([]);

  const [
    delays,
    setDelays,
  ] =
    useState<
      DelayHistory[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    loadTaskDetails();
  }, [id]);

  /* ==========================================
     LOAD DETAILS
  ========================================== */

  async function loadTaskDetails() {
    setLoading(true);

    setError("");

    try {
      const response =
        await api.get(
          `/tasks/${id}/details`
        );

      setTask(
        response.data.data.task
      );

      setStatusHistory(
        response.data.data
          .statusHistory || []
      );

      setDelays(
        response.data.data
          .delays || []
      );

      /*
        Opening a delegation automatically
        clears this user's unread notifications
        for this delegation.
      */

      try {
        if (id) {
          await api.patch(
            `/notifications/task/${id}/read`
          );

          window.dispatchEvent(
            new Event(
              "notifications-updated"
            )
          );
        }
      } catch (
        notificationError
      ) {
        /*
          Notification failure must never
          stop the delegation details page.
        */

        console.error(
          "Unable to clear delegation notifications",
          notificationError
        );
      }

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
          "Unable to load delegation details"
      );

    } finally {

      setLoading(false);

    }
  }

  /* ==========================================
     DATE ONLY

     START / TARGET / REVISED TARGET
  ========================================== */


  /* ==========================================
     DATE + TIME

     SYSTEM / AUDIT LOGS
  ========================================== */

  function formatDateTime(
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

    return date.toLocaleString();
  }

  /* ==========================================
     STATUS TEXT
  ========================================== */

  function formatStatus(
    value?: string
  ) {
    if (!value) {
      return "-";
    }

    if (
      value === "ON_HOLD"
    ) {
      return "PENDING";
    }

    if (
      value === "COMPLETED"
    ) {
      return "COMPLETE";
    }

    return value.replaceAll(
      "_",
      " "
    );
  }

  /* ==========================================
     REVISED TARGET

     SHOW ONLY IF TARGET WAS CHANGED
  ========================================== */

  function getRevisedTarget() {
    if (
      !task?.originalTargetDate ||
      !task?.currentTargetDate
    ) {
      return "-";
    }

    const original =
      new Date(
        task.originalTargetDate
      );

    const current =
      new Date(
        task.currentTargetDate
      );

    if (
      Number.isNaN(
        original.getTime()
      ) ||
      Number.isNaN(
        current.getTime()
      )
    ) {
      return "-";
    }

    if (
      original.getTime() ===
      current.getTime()
    ) {
      return "-";
    }

    return formatDateOnly(
      task.currentTargetDate
    );
  }

  /* ==========================================
     LOADING
  ========================================== */

  if (loading) {
    return (
      <div className="details-loading">
        Loading delegation...
      </div>
    );
  }

  /* ==========================================
     ERROR
  ========================================== */

  if (
    error ||
    !task
  ) {
    return (
      <div className="details-page">

        <div className="details-error">
          {error ||
            "Delegation not found"}
        </div>

        <div className="details-bottom-actions">

          <button
            type="button"
            className="details-bottom-back-button"
            onClick={() =>
              navigate(-1)
            }
          >
            ← Back
          </button>

        </div>

      </div>
    );
  }

  return (
    <div className="details-page">

      {/* ======================================
          TITLE
      ====================================== */}

      <div className="details-header">

        <div className="details-title-row">

          <div>

            <div className="details-id">
              Delegation #{task.id}
            </div>

            <h1>
              {task.title}
            </h1>

          </div>

          <span
            className={`details-status status-${task.status.toLowerCase()}`}
          >
            {formatStatus(
              task.status
            )}
          </span>

        </div>

      </div>

      {/* ======================================
          DELEGATION SUMMARY
      ====================================== */}

      <section className="details-card">

        <div className="section-title">
          Delegation Summary
        </div>

        <div className="details-grid">

          <Info
            label="Department"
            value={
              task.departmentName
            }
          />

          <Info
            label="Priority"
            value={
              task.priority
            }
          />

          <Info
            label="Responsibility"
            value={
              task.responsibility
            }
          />

          <Info
            label="Created By"
            value={
              task.createdByName
            }
          />

          <Info
            label="Assigned EA"
            value={
              task.assignedEaName ||
              "-"
            }
          />

          <Info
            label="Employee"
            value={
              task.assignedEmployeeName ||
              "-"
            }
          />

        </div>

        <div className="description-box">

          <span>
            Description
          </span>

          <p>
            {task.description ||
              "-"}
          </p>

        </div>

      </section>

      {/* ======================================
          PLANNING & DATES
      ====================================== */}

      <section className="details-card">

        <div className="section-title">
          Planning & Dates
        </div>

        <div className="details-grid">

          <Info
            label="Created Log"
            value={
              formatDateTime(
                task.createdAt
              )
            }
          />

          <Info
            label="Start Date"
            value={
              formatDateOnly(
                task.startDate
              )
            }
          />

          <Info
            label="Target Date"
            value={
              formatDateOnly(
                task.originalTargetDate
              )
            }
          />

          <Info
            label="Revised Target Date"
            value={
              getRevisedTarget()
            }
          />

          <Info
            label="Completed Log"
            value={
              formatDateTime(
                task.completedAt
              )
            }
          />

          <Info
            label="Last Updated Log"
            value={
              formatDateTime(
                task.updatedAt
              )
            }
          />

        </div>

      </section>

      {/* ======================================
          RESPONSIBILITY & PERFORMANCE
      ====================================== */}

      <section className="details-card">

        <div className="section-title">
          Responsibility & Performance
        </div>

        <div className="details-grid">

          <Info
            label="EA First Action Log"
            value={
              formatDateTime(
                task.eaFirstActionAt
              )
            }
          />

          <Info
            label="EA Response"
            value={
              task.eaFirstActionAt
                ? task.eaLateResponse
                  ? "Late"
                  : "On Time"
                : "Pending"
            }
          />

          <Info
            label="Delay Count"
            value={
              String(
                task.delayCount ||
                  0
              )
            }
          />

          <Info
            label="Target Revisions"
            value={`${task.targetDateUpdateCount || 0} / 3`}
          />

        </div>

      </section>

      {/* ======================================
          TARGET REVISION HISTORY
      ====================================== */}

      <section className="details-card">

        <div className="section-title">
          Target Revision History
        </div>

        {delays.length ===
        0 ? (

          <div className="history-empty">
            No target revisions recorded.
          </div>

        ) : (

          <div className="delay-list">

            {delays.map(
              (delay) => (

                <div
                  className="delay-item"
                  key={
                    delay.id
                  }
                >

                  <div className="delay-number">

                    Revision #
                    {
                      delay.delayNumber
                    }

                  </div>

                  <div className="delay-dates">

                    <div>

                      <span>
                        Previous Target
                      </span>

                      <strong>
                        {formatDateOnly(
                          delay.oldTargetDate
                        )}
                      </strong>

                    </div>

                    <div className="delay-arrow">
                      →
                    </div>

                    <div>

                      <span>
                        Revised Target
                      </span>

                      <strong>
                        {formatDateOnly(
                          delay.newTargetDate
                        )}
                      </strong>

                    </div>

                  </div>

                  <div className="delay-reason">

                    <span>
                      Reason
                    </span>

                    <p>
                      {
                        delay.reason
                      }
                    </p>

                  </div>

                  <div className="delay-footer">

                    Updated by{" "}

                    <strong>
                      {
                        delay.createdByName
                      }
                    </strong>

                    {" • "}

                    {formatDateTime(
                      delay.createdAt
                    )}

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </section>

      {/* ======================================
          STATUS HISTORY
      ====================================== */}

      <section className="details-card">

        <div className="section-title">
          Status History
        </div>

        {statusHistory.length ===
        0 ? (

          <div className="history-empty">
            No status history found.
          </div>

        ) : (

          <div className="timeline">

            {statusHistory.map(
              (history) => (

                <div
                  className="timeline-item"
                  key={
                    history.id
                  }
                >

                  <div className="timeline-dot" />

                  <div className="timeline-content">

                    <div className="timeline-top">

                      <strong>

                        {history.fromStatus
                          ? `${formatStatus(
                              history.fromStatus
                            )} → ${formatStatus(
                              history.toStatus
                            )}`
                          : formatStatus(
                              history.toStatus
                            )}

                      </strong>

                      <span>
                        {formatDateTime(
                          history.createdAt
                        )}
                      </span>

                    </div>

                    <div className="timeline-user">

                      {
                        history.changedByName
                      }

                      {" • "}

                      {
                        history.changedByRole
                      }

                    </div>

                    {history.note && (

                      <div className="timeline-note">

                        {
                          history.note
                        }

                      </div>

                    )}

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </section>

      {/* ======================================
          ONE BACK BUTTON ONLY
      ====================================== */}

      <div className="details-bottom-actions">

        <button
          type="button"
          className="details-bottom-back-button"
          onClick={() =>
            navigate(-1)
          }
        >
          ← Back
        </button>

      </div>

    </div>
  );
}

/* ============================================
   INFO CARD

   IMPORTANT:
   NO BACK BUTTON INSIDE THIS COMPONENT
============================================ */

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="info-box">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}
