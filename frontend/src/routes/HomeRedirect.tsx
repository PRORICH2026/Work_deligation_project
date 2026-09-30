import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import api from "../services/api";

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

export default function HomeRedirect() {
  const [role, setRole] =
    useState<string | null>(
      null
    );

  const [
    failed,
    setFailed,
  ] =
    useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response =
        await api.get(
          "/auth/me"
        );

      setRole(
        response.data.user.role
      );
    } catch {
      setFailed(true);
    }
  }

  if (failed) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  if (!role) {
    return (
      <div className="main-loading">
        Loading...
      </div>
    );
  }

  if (
    managementRoles.includes(
      role
    )
  ) {
    return (
      <Navigate
        to="/management/delegations"
        replace
      />
    );
  }

  return (
    <Navigate
      to="/tasks"
      replace
    />
  );
}