import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./NewDelegation.css";

interface Department {
  id: number;
  name: string;
  isActive?: boolean | number;
}

interface EAUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive?: boolean | number;
}

export default function NewDelegation() {
  const navigate =
    useNavigate();

  const [
    departments,
    setDepartments,
  ] = useState<Department[]>([]);

  const [
    eaUsers,
    setEaUsers,
  ] = useState<EAUser[]>([]);

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    departmentId,
    setDepartmentId,
  ] = useState("");

  const [
    priority,
    setPriority,
  ] = useState("MEDIUM");

  const [
    assignedEaId,
    setAssignedEaId,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    formLoading,
    setFormLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    loadFormData();
  }, []);

  /* ==========================================
     LOAD DEPARTMENT + EA
  ========================================== */

  async function loadFormData() {
    setFormLoading(true);
    setError("");

    try {
      const [
        departmentResponse,
        eaResponse,
      ] = await Promise.all([
        api.get(
          "/departments"
        ),

        api.get(
          "/users?role=EA"
        ),
      ]);

      /*
        SUPPORT CURRENT DEPARTMENT
        RESPONSE FORMAT
      */

      const departmentData =
        Array.isArray(
          departmentResponse.data
        )
          ? departmentResponse.data
          : departmentResponse.data
              .data ||
            departmentResponse.data
              .departments ||
            [];

      /*
        SUPPORT CURRENT USER
        RESPONSE FORMAT
      */

      const userData =
        Array.isArray(
          eaResponse.data
        )
          ? eaResponse.data
          : eaResponse.data.data ||
            eaResponse.data.users ||
            [];

      const activeDepartments =
        departmentData.filter(
          (
            department: Department
          ) =>
            department.isActive ===
              undefined ||
            department.isActive ===
              true ||
            department.isActive ===
              1
        );

      const activeEas =
        userData.filter(
          (user: EAUser) =>
            user.role === "EA" &&
            (
              user.isActive ===
                undefined ||
              user.isActive ===
                true ||
              user.isActive === 1
            )
        );

      setDepartments(
        activeDepartments
      );

      setEaUsers(
        activeEas
      );

    } catch (error: any) {

      console.error(
        "FORM DATA ERROR:",
        error
      );

      if (
        error.response?.status ===
        401
      ) {
        navigate("/");
        return;
      }

      setDepartments([]);
      setEaUsers([]);

      setError(
        error.response?.data
          ?.message ||
          "Unable to load form data"
      );

    } finally {

      setFormLoading(false);

    }
  }

  /* ==========================================
     CREATE DELEGATION
  ========================================== */

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (
      !title.trim() ||
      !departmentId ||
      !priority ||
      !assignedEaId ||
      !description.trim()
    ) {
      setError(
        "Please complete all required fields."
      );

      return;
    }

    setLoading(true);

    try {
      await api.post(
        "/tasks",
        {
          title:
            title.trim(),

          description:
            description.trim(),

          priority,

          departmentId:
            Number(
              departmentId
            ),

          assignedEaId:
            Number(
              assignedEaId
            ),
        }
      );

      setMessage(
        "Delegation created successfully."
      );

      setTitle("");
      setDepartmentId("");
      setPriority("MEDIUM");
      setAssignedEaId("");
      setDescription("");

    } catch (error: any) {

      setError(
        error.response?.data
          ?.message ||
          "Unable to create delegation"
      );

    } finally {

      setLoading(false);

    }
  }

  return (
    <div className="new-delegation-page">

      <div className="new-delegation-container">

        <h1>
          Create New Delegation
        </h1>

        {error && (
          <div className="delegation-form-error">
            {error}
          </div>
        )}

        {message && (
          <div className="delegation-form-success">
            {message}
          </div>
        )}

        <form
          className="delegation-form-card"
          onSubmit={
            handleSubmit
          }
        >

          <div className="delegation-form-grid">

            {/* TASK TITLE */}

            <div className="form-group">

              <label>
                Task Title *
              </label>

              <input
                type="text"

                value={
                  title
                }

                onChange={(e) =>
                  setTitle(
                    e.target.value
                  )
                }

                placeholder="Enter task title"

                required
              />

            </div>

            {/* DEPARTMENT */}

            <div className="form-group">

              <label>
                Department *
              </label>

              <select
                value={
                  departmentId
                }

                onChange={(e) =>
                  setDepartmentId(
                    e.target.value
                  )
                }

                disabled={
                  formLoading
                }

                required
              >

                <option value="">
                  {formLoading
                    ? "Loading..."
                    : "Select Department"}
                </option>

                {departments.map(
                  (
                    department
                  ) => (

                    <option
                      key={
                        department.id
                      }

                      value={
                        department.id
                      }
                    >
                      {
                        department.name
                      }
                    </option>

                  )
                )}

              </select>

            </div>

            {/* PRIORITY */}

            <div className="form-group">

              <label>
                Priority *
              </label>

              <select
                value={
                  priority
                }

                onChange={(e) =>
                  setPriority(
                    e.target.value
                  )
                }

                required
              >

                <option value="HIGH">
                  High
                </option>

                <option value="MEDIUM">
                  Medium
                </option>

                <option value="LOW">
                  Low
                </option>

              </select>

            </div>

            {/* ASSIGN EA */}

            <div className="form-group">

              <label>
                Assign to *
              </label>

              <select
                value={
                  assignedEaId
                }

                onChange={(e) =>
                  setAssignedEaId(
                    e.target.value
                  )
                }

                disabled={
                  formLoading
                }

                required
              >

                <option value="">
                  {formLoading
                    ? "Loading..."
                    : "Select EA"}
                </option>

                {eaUsers.map(
                  (ea) => (

                    <option
                      key={
                        ea.id
                      }

                      value={
                        ea.id
                      }
                    >
                      {ea.name}
                    </option>

                  )
                )}

              </select>

            </div>

          </div>

          {/* DESCRIPTION */}

          <div className="form-group delegation-description">

            <label>
              Description *
            </label>

            <textarea
              rows={5}

              value={
                description
              }

              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }

              placeholder="Enter task description"

              required
            />

          </div>

          {/* ACTIONS */}

          <div className="delegation-form-actions">

            <button
              type="button"

              className="delegation-cancel-button"

              onClick={() =>
                navigate(
                  "/tasks"
                )
              }
            >
              Cancel
            </button>

            <button
              type="submit"

              className="delegation-submit-button"

              disabled={
                loading ||
                formLoading
              }
            >

              {loading
                ? "Creating..."
                : "Create Delegation"}

            </button>

          </div>

        </form>

      </div>

    </div>
  );
}