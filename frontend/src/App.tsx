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

        <Route
          element={<AppLayout />}
        >

          <Route
            path="/dashboard"
            element={
              <HomeRedirect />
            }
          />

          <Route
            path="/management/delegations"
            element={
              <Dashboard />
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

        </Route>

      </Routes>

    </BrowserRouter>
  );
}