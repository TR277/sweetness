import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Home from "./pages/Home";
import Data from "./pages/Data";
import Library from "./pages/Library";
import Profile from "./pages/Profile";
import Experience from "./pages/Experience";
import Session from "./pages/Session";
import SessionSummary from "./pages/SessionSummary";
import SpotifyCallback from "./pages/SpotifyCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/summary" element={<SessionSummary />} />
          <Route path="/session/summary" element={<Navigate to="/summary" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/data" element={<Data />} />
            <Route path="/library" element={<Library />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/experience" element={<Experience />} />
            <Route path="/session" element={<Session />} />
            <Route path="/spotify/callback" element={<SpotifyCallback />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
