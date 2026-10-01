import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import api from "../services/api";
import type { CurrentUser } from "../types/user";

const SessionContext = createContext<CurrentUser | null>(null);
export function useCurrentUser() {
  return useContext(SessionContext);
}

export default function RequireSession() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.get("/auth/me")
      .then((response) => { if (active) setUser(response.data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <div className="main-loading">Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  return <SessionContext.Provider value={user}><Outlet /></SessionContext.Provider>;
}
