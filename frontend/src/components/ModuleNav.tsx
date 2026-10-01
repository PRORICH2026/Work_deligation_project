import { useLocation, useNavigate } from "react-router-dom";
import { moduleRoutes, canAccessPath } from "../routes/access";
import { useCurrentUser } from "../routes/RequireSession";
import "./ModuleNav.css";

export default function ModuleNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  if (!user) return null;

  return (
    <div className="module-nav-bar">
      <div className="module-nav-inner">
        {moduleRoutes.filter((route) => canAccessPath(user.role, route.path)).map((route) => {
          const active = location.pathname === route.path;
          const className = route.path === "/new-delegation"
            ? `module-nav-button new-button${active ? " active-new" : ""}`
            : `module-nav-button${active ? " active" : ""}`;
          return (
            <button key={route.path} className={className} onClick={() => navigate(route.path)}>
              {route.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
