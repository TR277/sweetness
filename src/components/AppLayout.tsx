import { NavLink, Outlet } from "react-router-dom";
import { Home, BarChart3, Music, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/data", label: "Data", icon: BarChart3 },
  { to: "/library", label: "Library", icon: Music },
  { to: "/profile", label: "Profile", icon: User },
];

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gradient-soft pb-24">
      <main className="mx-auto max-w-md px-4 pt-6">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-medium transition-soft",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-2xl transition-soft",
                      isActive && "bg-primary/15 shadow-soft"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
