import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";

import Tasks from "./pages/Tasks";

import TaskDetails from "./pages/TaskDetails";

import NewDelegation from "./pages/NewDelegation";

import AppLayout from "./layouts/AppLayout";

import HomeRedirect from "./routes/HomeRedirect";
import RequireSession from "./routes/RequireSession";
import RequireModule from "./routes/RequireModule";
import Performance from "./pages/Performance";
import EmployeeManagement from "./pages/EmployeeManagement";

export default function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* LOGIN */}

        <Route
          path="/"
          element={<Login />}
        />

        {/* LOGGED-IN APPLICATION */}

        <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>

          <Route
            path="/dashboard"
            element={
              <HomeRedirect />
            }
          />

          <Route
            path="/management/delegations"
            element={
              <RequireModule path="/management/delegations"><Dashboard /></RequireModule>
            }
          />

          <Route
            path="/tasks"
            element={
              <Tasks />
            }
          />

          <Route
            path="/tasks/:id"
            element={
              <TaskDetails />
            }
          />

          <Route
            path="/new-delegation"
            element={
              <NewDelegation />
            }
          />

          <Route path="/performance" element={
            <RequireModule path="/performance"><Performance /></RequireModule>
          } />
          <Route path="/employee-management" element={
            <RequireModule path="/employee-management"><EmployeeManagement /></RequireModule>
          } />

        </Route>
        </Route>

      </Routes>

    </BrowserRouter>
  );
}
