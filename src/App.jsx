import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AdminProvider } from "./context/AdminContext";
import { AuthProvider } from "./context/AuthContext";
import { OrganizationProvider } from "./context/OrganizationContext";
import { ThemeProvider } from "./context/ThemeContext";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import HackathonDetail from "./pages/HackathonDetail";
import Hackathons from "./pages/Hackathons";
import Home from "./pages/Home";
import IdeaGenerator from "./pages/IdeaGenerator";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OrganizationRegister from "./pages/OrganizationRegister";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import OrganizerHostHackathon from "./pages/OrganizerHostHackathon";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import Teams from "./pages/Teams";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <AdminProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="hackathons" element={<Hackathons />} />
                  <Route path="hackathons/:slug" element={<HackathonDetail />} />
                  <Route path="ideas" element={<IdeaGenerator />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="leaderboard" element={<Leaderboard />} />
                  <Route
                    path="dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="organizer"
                    element={
                      <ProtectedRoute>
                        <OrganizerDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="organizer/host"
                    element={
                      <ProtectedRoute>
                        <OrganizerHostHackathon />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="organization/register"
                    element={
                      <ProtectedRoute>
                        <OrganizationRegister />
                      </ProtectedRoute>
                    }
                  />
                  {/* The page itself redirects non-admins (and signed-out visitors) home. */}
                  <Route path="admin" element={<Admin />} />
                  <Route path="login" element={<Login />} />
                  <Route path="signup" element={<Signup />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AdminProvider>
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
