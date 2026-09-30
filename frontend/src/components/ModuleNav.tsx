import {
  useEffect,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./ModuleNav.css";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

export default function ModuleNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] =
    useState<User | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response =
        await api.get("/auth/me");

      setUser(
        response.data.user
      );
    } catch {
      navigate("/");
    }
  }

  if (!user) {
    return null;
  }

  const isManagement =
    managementRoles.includes(
      user.role
    );

  function buttonClass(
    path: string
  ) {
    return location.pathname === path
      ? "module-nav-button active"
      : "module-nav-button";
  }

  function newDelegationClass() {
    return location.pathname ===
      "/new-delegation"
      ? "module-nav-button new-button active-new"
      : "module-nav-button new-button";
  }

  return (
    <div className="module-nav-bar">

      <div className="module-nav-inner">

        {/* 1. TASK MANAGEMENT */}

        <button
          className={
            buttonClass(
              "/tasks"
            )
          }
          onClick={() =>
            navigate("/tasks")
          }
        >
          Task Management
        </button>

        {/* 2. ALL DELEGATIONS - MANAGEMENT ONLY */}

        {isManagement && (
          <button
            className={
              buttonClass(
                "/management/delegations"
              )
            }
            onClick={() =>
              navigate(
                "/management/delegations"
              )
            }
          >
            All Delegations
          </button>
        )}

        {/* 3. NEW DELEGATION */}

        <button
          className={
            newDelegationClass()
          }
          onClick={() =>
            navigate(
              "/new-delegation"
            )
          }
        >
          + New Delegation
        </button>

      </div>

    </div>
  );
}