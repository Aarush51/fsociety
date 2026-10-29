import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { AppShell } from "../ui";

function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search]);
  return null;
}

export default function Layout() {
  return (
    <AppShell>
      <ScrollToTop />
      <Header />
      <div className="hm-shell-body">
        <Sidebar />
        <div className="hm-route-content">
          <Outlet />
        </div>
      </div>
      <Footer />
    </AppShell>
  );
}
