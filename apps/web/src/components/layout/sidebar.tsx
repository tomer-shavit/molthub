"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Bot,
  Settings,
  FileText,
  Activity,
  History,
  Layers,
  ChevronDown,
  Menu,
  X,
  AlertTriangle,
  DollarSign,
  Target,
  MessageSquare,
  Plus,
  Route,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserStage } from "@/lib/user-stage-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: { label: string; href: string }[];
}

const allNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "Fleets", href: "/fleets", icon: <Layers className="w-4 h-4" /> },
  { label: "Bots", href: "/bots", icon: <Bot className="w-4 h-4" /> },
  { label: "Routing Rules", href: "/routing", icon: <Route className="w-4 h-4" /> },
  { label: "Channels", href: "/channels", icon: <MessageSquare className="w-4 h-4" /> },
  { label: "Alerts", href: "/alerts", icon: <AlertTriangle className="w-4 h-4" /> },
  { label: "Notifications", href: "/notifications", icon: <Bell className="w-4 h-4" /> },
  { label: "SLOs", href: "/slos", icon: <Target className="w-4 h-4" /> },
  { label: "Costs", href: "/costs", icon: <DollarSign className="w-4 h-4" /> },
  {
    label: "Configuration",
    href: "#",
    icon: <Settings className="w-4 h-4" />,
    children: [
      { label: "Profiles", href: "/profiles" },
      { label: "Templates", href: "/templates" },
    ]
  },
  { label: "Traces", href: "/traces", icon: <Activity className="w-4 h-4" /> },
  { label: "Change Sets", href: "/changesets", icon: <FileText className="w-4 h-4" /> },
  { label: "Audit Log", href: "/audit", icon: <History className="w-4 h-4" /> },
];


export function Sidebar() {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  useUserStage(); // Still needed for stage-based features

  const navItems = allNavItems;

  const toggleExpand = (label: string) => {
    setExpanded(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-screen w-64 bg-card border-r transition-transform duration-200 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Clawster</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-3">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.children ? (
                    <div>
                      <button
                        onClick={() => toggleExpand(item.label)}
                        className={cn(
                          "flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md transition-colors",
                          "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          {item.label}
                        </div>
                        <ChevronDown className={cn(
                          "w-4 h-4 transition-transform",
                          expanded.includes(item.label) && "rotate-180"
                        )} />
                      </button>
                      {expanded.includes(item.label) && (
                        <ul className="mt-1 ml-4 space-y-1">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className="flex items-center px-3 py-2 text-sm text-muted-foreground rounded-md hover:bg-accent hover:text-accent-foreground"
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            {/* Deploy New Bot button */}
            <div className="px-3 mt-4">
              <Link href="/bots/new">
                <Button className="w-full gap-2" variant="default">
                  <Plus className="w-4 h-4" />
                  Deploy New Bot
                </Button>
              </Link>
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground text-center">
              Clawster v0.1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
