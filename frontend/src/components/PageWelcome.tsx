import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./PageWelcome.css";

import type {
  CurrentUser,
} from "../types/user";

export default function PageWelcome() {
  const navigate =
    useNavigate();

  const [
    user,
    setUser,
  ] =
    useState<CurrentUser | null>(
      null
    );

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response =
        await api.get(
          "/auth/me"
        );

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

  return (
    <div className="page-welcome">

      <div className="page-welcome-inner">

        <h1>
          Welcome, {user.name}
        </h1>

      </div>

    </div>
  );
}