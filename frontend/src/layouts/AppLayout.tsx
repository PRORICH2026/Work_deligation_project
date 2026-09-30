import {
  Outlet,
} from "react-router-dom";

import AppHeader from "../components/AppHeader";
import ModuleNav from "../components/ModuleNav";
import PageWelcome from "../components/PageWelcome";

export default function AppLayout() {
  return (
    <>

      <AppHeader />

      <ModuleNav />

      <div className="app-layout-content">

        <PageWelcome />

        <Outlet />

      </div>

    </>
  );
}